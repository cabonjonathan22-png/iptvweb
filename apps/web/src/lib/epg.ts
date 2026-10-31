import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm';
import type { EpgProgram } from '@iptv/shared';
import { getDb, schema } from './db';

/** Programmes des chaînes `epgIds` qui recouvrent [from, to], groupés par chaîne. */
export async function programsFor(playlistId: string, epgIds: string[], from: number, to: number) {
  const out = new Map<string, EpgProgram[]>();
  if (!epgIds.length) return out;
  const db = await getDb();
  const ep = schema.epgPrograms;
  const rows = await db
    .select({ channel: ep.channelEpgId, start: ep.start, stop: ep.stop, title: ep.title, desc: ep.description })
    .from(ep)
    .where(
      and(eq(ep.playlistId, playlistId), inArray(ep.channelEpgId, epgIds), gt(ep.stop, new Date(from)), lt(ep.start, new Date(to))),
    )
    .orderBy(asc(ep.channelEpgId), asc(ep.start));
  for (const r of rows) {
    const list = out.get(r.channel) || [];
    list.push({ start: r.start.getTime(), stop: r.stop.getTime(), title: r.title, desc: r.desc });
    out.set(r.channel, list);
  }
  return out;
}
