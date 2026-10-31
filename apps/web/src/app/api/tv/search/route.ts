import { and, asc, eq, sql } from 'drizzle-orm';
import type { SearchResponse } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { json } from '@/lib/http';
import { tvContext, visibleCategory } from '@/lib/tv-api';
import { channelColumns, toPoster, toTvChannel } from '@/lib/tv-channels';

const LIMIT = 20;

/**
 * Recherche globale (chaînes, films, séries) pour le clavier virtuel.
 * `lower(name) LIKE '%q%'` est servi par les index trigrammes ; les noms qui
 * commencent par la saisie passent en premier.
 */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const q = (new URL(req.url).searchParams.get('q') || '').trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return json<SearchResponse>({ channels: [], movies: [], series: [] });
  const esc = q.replace(/[\\%_]/g, (m) => '\\' + m);
  const db = await getDb();
  const c = schema.categories;

  const run = <T extends typeof schema.channels | typeof schema.vodItems | typeof schema.series>(t: T) => ({
    where: and(eq(t.playlistId, ctx.playlist.id), visibleCategory(t.categoryId, ctx.lockedOk), sql`lower(${t.name}) like ${'%' + esc + '%'}`),
    order: [sql`(lower(${t.name}) like ${esc + '%'}) desc`, sql`length(${t.name})`, asc(t.id)],
  });

  const ch = schema.channels;
  const v = schema.vodItems;
  const s = schema.series;
  const [a, b, d] = [run(ch), run(v), run(s)];
  const [channels, movies, series] = await Promise.all([
    db.select(channelColumns).from(ch).leftJoin(c, eq(c.id, ch.categoryId)).where(a.where).orderBy(...a.order).limit(LIMIT),
    db.select({ id: v.id, name: v.name, poster: v.poster, year: v.year, rating: v.rating }).from(v).leftJoin(c, eq(c.id, v.categoryId)).where(b.where).orderBy(...b.order).limit(LIMIT),
    db.select({ id: s.id, name: s.name, poster: s.poster, year: s.year, rating: s.rating }).from(s).leftJoin(c, eq(c.id, s.categoryId)).where(d.where).orderBy(...d.order).limit(LIMIT),
  ]);
  return json<SearchResponse>({
    channels: channels.map((r) => toTvChannel(r, ctx.origin)),
    movies: movies.map((r) => toPoster(r, ctx.origin)),
    series: series.map((r) => toPoster(r, ctx.origin)),
  });
}
