import { and, isNull, lt, ne, or } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { kickJob, staleJobIds, startSync, syncSecret } from '@/lib/sync/runner';
import { purgeExpiredKv } from '@/lib/kv';
import { apiError, json } from '@/lib/http';

/**
 * Vercel Cron (1 fois / jour sur le plan gratuit Hobby, cf. vercel.json) :
 *  - relance la synchro des playlists dont la dernière date de plus de ~12 h ;
 *  - reprend les jobs abandonnés (bail expiré) ;
 *  - purge l'EPG de plus de 24 h.
 */
export const maxDuration = 60;

const MAX_PER_RUN = 25;
/** Resynchro des playlists plus vieilles que ça (le cron passe au moins une fois par jour). */
const SYNC_EVERY_MS = 11.5 * 3600_000;

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== 'Bearer ' + syncSecret()) return apiError(401, 'unauthorized');
  const db = await getDb();
  const p = schema.playlists;
  const due = await db
    .select({ id: p.id })
    .from(p)
    .where(and(ne(p.status, 'syncing'), ne(p.type, 'm3u_file'), or(isNull(p.lastSyncAt), lt(p.lastSyncAt, new Date(Date.now() - SYNC_EVERY_MS)))))
    .limit(MAX_PER_RUN);

  // Purge des programmes terminés depuis plus de 24 h.
  await db.delete(schema.epgPrograms).where(lt(schema.epgPrograms.stop, new Date(Date.now() - 24 * 3600_000)));
  await purgeExpiredKv();

  const jobs = new Set(await staleJobIds());
  for (const { id } of due) jobs.add(await startSync(id));
  await Promise.all(Array.from(jobs).map(kickJob));
  return json({ started: due.length, kicked: jobs.size });
}
