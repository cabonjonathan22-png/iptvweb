import { and, isNull, lt, ne, or } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { kickJob, staleJobIds, startSync, syncSecret } from '@/lib/sync/runner';
import { apiError, json } from '@/lib/http';

/**
 * Vercel Cron (toutes les 12 h, cf. vercel.json) :
 *  - relance la synchro des playlists dont la dernière date de plus de ~12 h ;
 *  - reprend les jobs abandonnés (bail expiré) ;
 *  - purge l'EPG de plus de 24 h.
 */
export const maxDuration = 60;

const MAX_PER_RUN = 25;

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== 'Bearer ' + syncSecret()) return apiError(401, 'unauthorized');
  const db = await getDb();
  const p = schema.playlists;
  const due = await db
    .select({ id: p.id })
    .from(p)
    .where(and(ne(p.status, 'syncing'), ne(p.type, 'm3u_file'), or(isNull(p.lastSyncAt), lt(p.lastSyncAt, new Date(Date.now() - 11.5 * 3600_000)))))
    .limit(MAX_PER_RUN);

  // Purge des programmes terminés depuis plus de 24 h.
  await db.delete(schema.epgPrograms).where(lt(schema.epgPrograms.stop, new Date(Date.now() - 24 * 3600_000)));

  const jobs = new Set(await staleJobIds());
  for (const { id } of due) jobs.add(await startSync(id));
  await Promise.all(Array.from(jobs).map(kickJob));
  return json({ started: due.length, kicked: jobs.size });
}
