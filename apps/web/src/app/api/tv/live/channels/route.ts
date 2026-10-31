import { asc, count, eq } from 'drizzle-orm';
import type { Page, TvChannel } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { apiError } from '@/lib/http';
import { cachedJson, tvContext } from '@/lib/tv-api';
import { channelColumns, toTvChannel, visibleChannels } from '@/lib/tv-channels';

const MAX_LIMIT = 200;

/**
 * Page de chaînes : ?category=<id>|all&offset=&limit=
 * La TV ne télécharge jamais la liste entière : elle demande les pages au fil du défilement.
 */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const sp = new URL(req.url).searchParams;
  const category = sp.get('category') || 'all';
  const offset = Math.max(0, Number(sp.get('offset')) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get('limit')) || 100));
  if (category !== 'all' && !/^\d+$/.test(category)) return apiError(400, 'bad_category');

  return cachedJson(req, ctx.playlist, async (): Promise<Page<TvChannel>> => {
    const db = await getDb();
    const ch = schema.channels;
    const c = schema.categories;
    const where = visibleChannels(ctx.playlist.id, category === 'all' ? undefined : eq(ch.categoryId, Number(category)));
    const [rows, [total]] = await Promise.all([
      db
        .select(channelColumns)
        .from(ch)
        .leftJoin(c, eq(c.id, ch.categoryId))
        .where(where)
        // « Toutes les chaînes » : ordre des numéros (cohérent avec le zapping par numéro).
        .orderBy(...(category === 'all' ? [asc(ch.num), asc(ch.id)] : [asc(ch.sortOrder), asc(ch.id)]))
        .limit(limit)
        .offset(offset),
      db.select({ n: count() }).from(ch).leftJoin(c, eq(c.id, ch.categoryId)).where(where),
    ]);
    return { total: total?.n ?? 0, offset, items: rows.map((r) => toTvChannel(r, ctx.origin)) };
  });
}
