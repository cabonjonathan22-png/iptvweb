/**
 * Orchestration des jobs de synchro.
 *
 *  startSync(playlistId) ─▶ job « queued » (nouvelle génération)
 *  kickJob(jobId)        ─▶ POST /api/sync/run (répond 202, travaille dans after())
 *  runJob(jobId)         ─▶ prend le bail, avance les phases jusqu'à la limite de
 *                           temps, puis se relance lui-même via kickJob.
 *
 * Le bail (lease_until) garantit un seul exécutant par job ; s'il expire (crash,
 * timeout dur), le cron ou une nouvelle demande de synchro reprend au dernier
 * curseur enregistré.
 */
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import type { PlaylistMeta } from '../db/schema';
import { appUrl } from '../http';
import { SourceError } from './source';
import { ContentWriter } from './writer';
import { syncM3u } from './m3u';
import { XTREAM_PHASES } from './xtream';
import { syncEpg } from './epg';
import type { PhaseCtx, PhaseHandler, Playlist } from './types';

const { syncJobs, playlists } = schema;

/**
 * Durée max d'une fonction (cf. maxDuration de /api/sync/run) moins une marge.
 * Surchargeable (tests : forcer le découpage en plusieurs invocations).
 */
export const SYNC_BUDGET_MS = Number(process.env.SYNC_BUDGET_MS) || 240_000;
const LEASE_MS = 90_000;
/** Garde-fou contre une synchro qui ne progresserait plus. */
const MAX_INVOCATIONS = 40;

const PHASES: Record<Playlist['type'], string[]> = {
  m3u_url: ['m3u', 'epg', 'finalize'],
  m3u_file: ['m3u', 'epg', 'finalize'],
  xtream: ['live_categories', 'live_streams', 'vod_categories', 'vod_streams', 'series_categories', 'series', 'epg', 'finalize'],
};

const HANDLERS: Record<string, PhaseHandler> = { m3u: syncM3u, epg: syncEpg, ...XTREAM_PHASES };

export const PHASE_LABELS: Record<string, string> = {
  m3u: 'Lecture de la playlist',
  live_categories: 'Catégories TV',
  live_streams: 'Chaînes TV',
  vod_categories: 'Catégories films',
  vod_streams: 'Films',
  series_categories: 'Catégories séries',
  series: 'Séries',
  epg: 'Guide TV',
  finalize: 'Finalisation',
};

export function syncSecret(): string {
  const s = process.env.CRON_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error('CRON_SECRET manquant');
  return 'dev-cron-secret';
}

/** Crée un job (ou renvoie celui en cours) et passe la playlist en « syncing ». */
export async function startSync(playlistId: string): Promise<string> {
  const db = await getDb();
  const active = await db.query.syncJobs.findFirst({
    where: and(eq(syncJobs.playlistId, playlistId), inArray(syncJobs.status, ['queued', 'running'])),
    orderBy: desc(syncJobs.createdAt),
  });
  if (active) return active.id;

  const [p] = await db
    .update(playlists)
    .set({ syncGen: sql`${playlists.syncGen} + 1`, status: 'syncing', lastError: null, updatedAt: new Date() })
    .where(eq(playlists.id, playlistId))
    .returning({ gen: playlists.syncGen, type: playlists.type });
  if (!p) throw new Error('Playlist introuvable');
  const [job] = await db
    .insert(syncJobs)
    .values({ playlistId, gen: p.gen, phase: PHASES[p.type][0]! })
    .returning({ id: syncJobs.id });
  return job!.id;
}

/** Déclenche l'exécution dans une nouvelle invocation de fonction. */
export async function kickJob(jobId: string): Promise<void> {
  const base = (process.env.SYNC_BASE_URL || appUrl()).replace(/\/$/, '');
  try {
    const res = await fetch(base + '/api/sync/run', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + syncSecret(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error('[sync] kick refusé', res.status);
  } catch (e) {
    // Le cron reprendra le job (bail expiré).
    console.error('[sync] kick impossible', (e as Error).message);
  }
}

type RunResult = 'done' | 'continue' | 'error' | 'busy';

export async function runJob(jobId: string, budgetMs = SYNC_BUDGET_MS): Promise<RunResult> {
  const started = Date.now();
  const db = await getDb();

  const [job] = await db
    .update(syncJobs)
    .set({
      status: 'running',
      leaseUntil: new Date(Date.now() + LEASE_MS),
      invocations: sql`${syncJobs.invocations} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncJobs.id, jobId),
        inArray(syncJobs.status, ['queued', 'running']),
        or(isNull(syncJobs.leaseUntil), lt(syncJobs.leaseUntil, new Date())),
      ),
    )
    .returning();
  if (!job) return 'busy';

  const fail = async (message: string) => {
    await db
      .update(syncJobs)
      .set({ status: 'error', error: message, leaseUntil: null, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(syncJobs.id, job.id));
    await db
      .update(playlists)
      .set({ status: 'error', lastError: message, updatedAt: new Date() })
      .where(and(eq(playlists.id, job.playlistId), eq(playlists.syncGen, job.gen)));
    return 'error' as const;
  };

  const playlist = await db.query.playlists.findFirst({ where: eq(playlists.id, job.playlistId) });
  if (!playlist) return fail('Playlist supprimée.');
  if (playlist.syncGen !== job.gen) return fail('Synchro remplacée par une plus récente.');
  if (job.invocations > MAX_INVOCATIONS) return fail('La synchronisation n’avance plus. Réessayez plus tard.');

  const writer = new ContentWriter(db, playlist.id, job.gen);
  await writer.init();
  let meta: PlaylistMeta = { ...playlist.meta };

  const ctx: PhaseCtx = {
    db,
    playlist,
    job,
    writer,
    timeUp: () => Date.now() - started > budgetMs,
    checkpoint: async (cursor) => {
      job.cursor = cursor;
      await db
        .update(syncJobs)
        .set({ cursor, leaseUntil: new Date(Date.now() + LEASE_MS), updatedAt: new Date() })
        .where(eq(syncJobs.id, job.id));
    },
    patchMeta: (m) => {
      meta = { ...meta, ...m };
    },
    meta: () => meta,
  };
  const saveMeta = () => db.update(playlists).set({ meta }).where(eq(playlists.id, playlist.id));
  const release = async () => {
    await saveMeta();
    await db.update(syncJobs).set({ leaseUntil: null, updatedAt: new Date() }).where(eq(syncJobs.id, job.id));
    return 'continue' as const;
  };

  try {
    const phases = PHASES[playlist.type];
    for (let i = Math.max(0, phases.indexOf(job.phase)); i < phases.length; i++) {
      const phase = phases[i]!;
      if (phase === 'finalize') {
        const counts = await writer.finalize({ keepEpisodes: playlist.type === 'xtream' });
        await db
          .update(playlists)
          .set({ ...counts, meta, status: 'ready', lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
          .where(eq(playlists.id, playlist.id));
        await db
          .update(syncJobs)
          .set({ status: 'done', phase, leaseUntil: null, finishedAt: new Date(), updatedAt: new Date() })
          .where(eq(syncJobs.id, job.id));
        return 'done';
      }
      if (job.phase !== phase) {
        job.phase = phase;
        job.cursor = 0;
        await db.update(syncJobs).set({ phase, cursor: 0, updatedAt: new Date() }).where(eq(syncJobs.id, job.id));
        // Contrôle du temps entre deux phases seulement : chaque invocation progresse d'au moins un lot.
        if (ctx.timeUp()) return release();
      }
      if ((await HANDLERS[phase]!(ctx)) === 'continue') return release();
    }
    return 'done';
  } catch (e) {
    console.error('[sync] échec', playlist.id, e);
    return fail(e instanceof SourceError ? e.message : 'Erreur inattendue pendant la synchronisation.');
  }
}

/** Jobs abandonnés (bail expiré depuis > 2 min) à relancer par le cron. */
export async function staleJobIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: syncJobs.id })
    .from(syncJobs)
    .where(
      and(
        inArray(syncJobs.status, ['queued', 'running']),
        lt(syncJobs.updatedAt, new Date(Date.now() - 120_000)),
        or(isNull(syncJobs.leaseUntil), lt(syncJobs.leaseUntil, new Date())),
      ),
    )
    .limit(20);
  return rows.map((r) => r.id);
}
