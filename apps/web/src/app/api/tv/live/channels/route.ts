import { eq } from 'drizzle-orm';
import type { Page, TvChannel } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { json } from '@/lib/http';
import { cachedJson, tvContext } from '@/lib/tv-api';
import { channelColumns, toTvChannel } from '@/lib/tv-channels';
import { countWhere, listQuery, parseListParams } from '@/lib/tv-lists';

/**
 * Page de chaînes : ?category=<id>|all|fav&offset=&limit=
 * La TV ne télécharge jamais la liste entière : elle demande les pages au fil du défilement.
 */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const { category, offset, limit } = parseListParams(req);
  const q = await listQuery(ctx, schema.channels, category);
  if (q instanceof Response) return q;

  const produce = async (): Promise<Page<TvChannel>> => {
    const db = await getDb();
    const ch = schema.channels;
    const [rows, total] = await Promise.all([
      db
        .select(channelColumns)
        .from(ch)
        .leftJoin(schema.categories, eq(schema.categories.id, ch.categoryId))
        .where(q.where)
        .orderBy(...q.order)
        .limit(limit)
        .offset(offset),
      countWhere(ch, q.where),
    ]);
    return { total, offset, items: rows.map((r) => toTvChannel(r, ctx.origin)) };
  };
  // Les favoris changent sans que la playlist change : pas d'ETag pour eux.
  return category === 'fav' ? json(await produce(), { headers: { 'Cache-Control': 'no-store' } }) : cachedJson(req, ctx, produce);
}
