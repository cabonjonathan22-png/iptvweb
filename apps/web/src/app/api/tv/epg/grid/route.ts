import { eq } from 'drizzle-orm';
import type { EpgGridRow } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { programsFor } from '@/lib/epg';
import { tvContext } from '@/lib/tv-api';
import { channelColumns, toTvChannel } from '@/lib/tv-channels';
import { countWhere, listQuery, parseListParams } from '@/lib/tv-lists';

const MAX_SPAN_MS = 12 * 3600_000;

/** Guide TV : une page de chaînes et leurs programmes sur [from, to] (12 h max). */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const sp = new URL(req.url).searchParams;
  const from = Number(sp.get('from'));
  const to = Number(sp.get('to'));
  if (!isFinite(from) || !isFinite(to) || to <= from || to - from > MAX_SPAN_MS) return apiError(400, 'bad_window');
  const { category, offset, limit } = parseListParams(req);
  const q = await listQuery(ctx, schema.channels, category);
  if (q instanceof Response) return q;

  const db = await getDb();
  const ch = schema.channels;
  const [rows, total] = await Promise.all([
    db.select(channelColumns).from(ch).leftJoin(schema.categories, eq(schema.categories.id, ch.categoryId)).where(q.where).orderBy(...q.order).limit(Math.min(limit, 50)).offset(offset),
    countWhere(ch, q.where),
  ]);
  const map = await programsFor(ctx.playlist.id, rows.map((r) => r.epgId).filter((x): x is string => !!x), from, to);
  const out: EpgGridRow[] = rows.map((r) => ({ channel: toTvChannel(r, ctx.origin), programs: (r.epgId && map.get(r.epgId)) || [] }));
  return json({ total, rows: out }, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
