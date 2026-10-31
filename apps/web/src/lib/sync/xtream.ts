/**
 * Synchro Xtream Codes via player_api.php, en phases :
 * catégories puis flux, pour le live, la VOD et les séries. Les listes de flux sont
 * lues en flux JSON (objet par objet) et écrites par lots ; leur curseur
 * permet de reprendre après un changement d'invocation.
 * Les épisodes (get_series_info) et fiches détaillées (get_vod_info) sont
 * chargés à la demande par l'app TV, pas ici.
 */
import {
  createJsonArrayStream,
  num,
  str,
  unixDate,
  xtreamApiUrl,
  yearOf,
  type ContentKind,
  type XtreamCategory,
  type XtreamCreds,
  type XtreamLiveStream,
  type XtreamSeries,
  type XtreamUserInfo,
  type XtreamVodStream,
} from '@iptv/shared';
import { decryptJson } from '../crypto';
import { fetchJson, fetchSource, responseText, SourceError } from './source';
import type { ChannelRow, SeriesRow, VodRow } from './writer';
import { BATCH, type PhaseCtx, type PhaseHandler, type PhaseResult } from './types';

export const creds = (ctx: PhaseCtx) => {
  if (!ctx.playlist.credentialsEnc) throw new SourceError('Identifiants Xtream manquants.', 'auth');
  return decryptJson<XtreamCreds>(ctx.playlist.credentialsEnc);
};

const yearInName = (n: string) => {
  const m = /[([](19|20)(\d{2})[)\]]/.exec(n);
  return m ? parseInt(m[1]! + m[2]!, 10) : null;
};

function categoriesPhase(kind: ContentKind, action: string): PhaseHandler {
  return async (ctx) => {
    const list = await fetchJson<XtreamCategory[] | Record<string, unknown>>(xtreamApiUrl(creds(ctx), action));
    if (!Array.isArray(list)) {
      // Certains panels renvoient {} quand une section est vide.
      return 'next';
    }
    await ctx.writer.ensureCategories(
      list
        .filter((c) => str(c.category_id) !== null)
        .map((c) => ({ kind, externalId: str(c.category_id)!, name: str(c.category_name) || 'Sans nom' })),
    );
    return 'next';
  };
}

/** Parcourt une liste JSON en flux, par lots, avec reprise au curseur. */
function streamsPhase<T>(action: string, write: (ctx: PhaseCtx, items: { v: T; i: number }[]) => Promise<void>): PhaseHandler {
  return async (ctx): Promise<PhaseResult> => {
    const url = xtreamApiUrl(creds(ctx), action);
    const res = await fetchSource(url, { timeoutMs: 60_000, headers: { Accept: 'application/json' } });
    const skip = ctx.job.cursor;
    let index = 0;
    let pending: { v: T; i: number }[] = [];
    const parser = createJsonArrayStream((v) => {
      const i = index++;
      if (i >= skip && v && typeof v === 'object') pending.push({ v: v as T, i });
    });
    for await (const chunk of responseText(res, url)) {
      parser.push(chunk);
      if (pending.length >= BATCH) {
        const b = pending;
        pending = [];
        await write(ctx, b);
        await ctx.checkpoint(index);
        if (ctx.timeUp()) return 'continue';
      }
    }
    const root = parser.end() as { user_info?: XtreamUserInfo } | null | undefined;
    if (root && root.user_info && num(root.user_info.auth) !== 1) {
      throw new SourceError('Identifiants Xtream refusés (abonnement expiré ou désactivé ?).', 'auth');
    }
    await write(ctx, pending);
    await ctx.checkpoint(index);
    return 'next';
  };
}

const base = (ctx: PhaseCtx) => ({ playlistId: ctx.playlist.id, syncGen: ctx.job.gen });

const writeLive = async (ctx: PhaseCtx, items: { v: XtreamLiveStream; i: number }[]) => {
  const rows: ChannelRow[] = [];
  for (const { v, i } of items) {
    const id = str(v.stream_id);
    if (!id) continue;
    const archive = num(v.tv_archive) === 1;
    rows.push({
      ...base(ctx),
      categoryId: ctx.writer.categoryId('live', str(v.category_id)),
      externalId: id,
      num: num(v.num),
      name: str(v.name) || 'Sans nom',
      logo: str(v.stream_icon),
      streamUrl: null,
      epgChannelId: str(v.epg_channel_id),
      catchup: archive ? 'xc' : null,
      catchupDays: archive ? num(v.tv_archive_duration) : null,
      sortOrder: i,
    });
  }
  await ctx.writer.upsertChannels(rows);
};

const writeVod = async (ctx: PhaseCtx, items: { v: XtreamVodStream; i: number }[]) => {
  const rows: VodRow[] = [];
  for (const { v, i } of items) {
    const id = str(v.stream_id);
    if (!id) continue;
    const name = str(v.name) || 'Sans titre';
    rows.push({
      ...base(ctx),
      categoryId: ctx.writer.categoryId('vod', str(v.category_id)),
      externalId: id,
      name,
      poster: str(v.stream_icon),
      year: yearInName(name),
      rating: num(v.rating),
      containerExt: str(v.container_extension),
      streamUrl: null,
      addedAt: unixDate(v.added),
      sortOrder: i,
    });
  }
  await ctx.writer.upsertVod(rows);
};

const writeSeries = async (ctx: PhaseCtx, items: { v: XtreamSeries; i: number }[]) => {
  const rows: SeriesRow[] = [];
  for (const { v, i } of items) {
    const id = str(v.series_id);
    if (!id) continue;
    const bd = Array.isArray(v.backdrop_path) ? v.backdrop_path[0] : v.backdrop_path;
    rows.push({
      ...base(ctx),
      categoryId: ctx.writer.categoryId('series', str(v.category_id)),
      externalId: id,
      name: str(v.name) || 'Sans titre',
      poster: str(v.cover),
      backdrop: str(bd),
      plot: str(v.plot),
      cast: str(v.cast),
      genre: str(v.genre),
      year: yearOf(v.releaseDate || v.release_date),
      rating: num(v.rating),
      addedAt: unixDate(v.last_modified),
      sortOrder: i,
    });
  }
  await ctx.writer.upsertSeries(rows);
};

export const XTREAM_PHASES: Record<string, PhaseHandler> = {
  live_categories: categoriesPhase('live', 'get_live_categories'),
  live_streams: streamsPhase('get_live_streams', writeLive),
  vod_categories: categoriesPhase('vod', 'get_vod_categories'),
  vod_streams: streamsPhase('get_vod_streams', writeVod),
  series_categories: categoriesPhase('series', 'get_series_categories'),
  series: streamsPhase('get_series', writeSeries),
};

/** Vérifie les identifiants avant enregistrement (ajout / modification de playlist). */
export async function checkXtreamAccount(c: XtreamCreds) {
  const info = await fetchJson<{ user_info?: XtreamUserInfo }>(xtreamApiUrl(c), 15_000).catch((e) => {
    if (e instanceof SourceError && e.code === 'invalid') {
      throw new SourceError("Ce serveur ne répond pas comme une API Xtream Codes. Vérifiez l'adresse (avec le port).", 'invalid');
    }
    throw e;
  });
  const u = info.user_info;
  if (!u || num(u.auth) !== 1) throw new SourceError('Identifiant ou mot de passe refusé par le serveur.', 'auth');
  if (u.status && u.status !== 'Active') throw new SourceError(`Abonnement non actif (${u.status}).`, 'auth');
  return {
    expiresAt: unixDate(u.exp_date)?.getTime() ?? null,
    maxConnections: num(u.max_connections),
  };
}
