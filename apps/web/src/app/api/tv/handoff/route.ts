import { and, desc, eq } from 'drizzle-orm';
import type { Handoff } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { json } from '@/lib/http';
import { tvContext, visibleCategory } from '@/lib/tv-api';
import { channelColumns, toTvChannel } from '@/lib/tv-channels';

const VOD_WINDOW_MS = 24 * 3600_000;
const LIVE_WINDOW_MS = 3 * 3600_000;
const MIN_POSITION_SEC = 30;

/**
 * Dernière lecture du compte si elle vient d'un AUTRE appareil : c'est ce qu'on
 * propose de continuer ici. Si cet appareil a lu quelque chose depuis, rien à proposer.
 */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const none = json<Handoff | null>(null, { headers: { 'Cache-Control': 'no-store' } });

  const db = await getDb();
  const w = schema.watchProgress;
  const [last] = await db.select().from(w).where(eq(w.userId, ctx.device.userId)).orderBy(desc(w.updatedAt)).limit(1);
  if (!last || !last.deviceId || last.deviceId === ctx.device.id || last.completed) return none;
  const age = Date.now() - last.updatedAt.getTime();
  if (age > (last.kind === 'live' ? LIVE_WINDOW_MS : VOD_WINDOW_MS)) return none;
  if (last.kind !== 'live' && last.positionSec < MIN_POSITION_SEC) return none;

  const from = await db.query.devices.findFirst({ columns: { name: true }, where: eq(schema.devices.id, last.deviceId) });
  const deviceName = from ? from.name : 'un autre appareil';
  const pid = ctx.playlist.id;
  const c = schema.categories;
  let out: Handoff | null = null;

  if (last.kind === 'live') {
    const ch = schema.channels;
    const [row] = await db
      .select(channelColumns)
      .from(ch)
      .leftJoin(c, eq(c.id, ch.categoryId))
      .where(and(eq(ch.id, last.itemId), eq(ch.playlistId, pid), visibleCategory(ch.categoryId, ctx)))
      .limit(1);
    if (row) out = { kind: 'live', deviceName, channel: toTvChannel(row, ctx.origin) };
  } else if (last.kind === 'vod') {
    const v = schema.vodItems;
    const [row] = await db
      .select({ id: v.id, name: v.name, poster: v.poster })
      .from(v)
      .leftJoin(c, eq(c.id, v.categoryId))
      .where(and(eq(v.id, last.itemId), eq(v.playlistId, pid), visibleCategory(v.categoryId, ctx)))
      .limit(1);
    if (row) out = { kind: 'vod', deviceName, id: row.id, name: row.name, subtitle: null, position: last.positionSec };
  } else {
    const e = schema.episodes;
    const s = schema.series;
    const [row] = await db
      .select({ id: e.id, season: e.season, episode: e.episode, title: e.title, seriesId: s.id, seriesName: s.name })
      .from(e)
      .innerJoin(s, eq(s.id, e.seriesId))
      .leftJoin(c, eq(c.id, s.categoryId))
      .where(and(eq(e.id, last.itemId), eq(e.playlistId, pid), visibleCategory(s.categoryId, ctx)))
      .limit(1);
    if (row) {
      out = {
        kind: 'episode',
        deviceName,
        id: row.id,
        seriesId: row.seriesId,
        name: row.seriesName,
        subtitle: 'S' + row.season + ' · E' + row.episode + (row.title ? ' · ' + row.title : ''),
        position: last.positionSec,
      };
    }
  }
  return json<Handoff | null>(out, { headers: { 'Cache-Control': 'no-store' } });
}
