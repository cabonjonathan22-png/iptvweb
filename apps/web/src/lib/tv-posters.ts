import { eq } from 'drizzle-orm';
import type { Page, PosterCard } from '@iptv/shared';
import { getDb, schema } from './db';
import { json } from './http';
import { cachedJson, tvContext } from './tv-api';
import { toPoster } from './tv-channels';
import { countWhere, listQuery, parseListParams } from './tv-lists';

/** Grille paginée de films ou de séries (?category=<id>|all|fav&offset=&limit=). */
export async function posterList(req: Request, kind: 'vod' | 'series') {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const t = kind === 'vod' ? schema.vodItems : schema.series;
  const { category, offset, limit } = parseListParams(req);
  const q = await listQuery(ctx, t, category);
  if (q instanceof Response) return q;

  const produce = async (): Promise<Page<PosterCard>> => {
    const db = await getDb();
    const [rows, total] = await Promise.all([
      db
        .select({ id: t.id, name: t.name, poster: t.poster, year: t.year, rating: t.rating })
        .from(t)
        .leftJoin(schema.categories, eq(schema.categories.id, t.categoryId))
        .where(q.where)
        .orderBy(...q.order)
        .limit(limit)
        .offset(offset),
      countWhere(t, q.where),
    ]);
    return { total, offset, items: rows.map((r) => toPoster(r, ctx.origin)) };
  };
  return category === 'fav' ? json(await produce(), { headers: { 'Cache-Control': 'no-store' } }) : cachedJson(req, ctx, produce);
}
