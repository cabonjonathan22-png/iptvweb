import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { TvCategory } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { cachedJson, tvContext } from '@/lib/tv-api';

/** Catégories live visibles, dans l'ordre choisi par l'utilisateur, avec leur nombre de chaînes. */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  return cachedJson(req, ctx.playlist, async (): Promise<TvCategory[]> => {
    const db = await getDb();
    const c = schema.categories;
    const ch = schema.channels;
    const rows = await db
      .select({
        id: c.id,
        name: sql<string>`coalesce(${c.customName}, ${c.name})`,
        locked: c.locked,
        count: count(ch.id),
      })
      .from(c)
      .innerJoin(ch, eq(ch.categoryId, c.id))
      .where(and(eq(c.playlistId, ctx.playlist.id), eq(c.kind, 'live'), eq(c.hidden, false)))
      .groupBy(c.id)
      .orderBy(asc(c.sortOrder), asc(c.id));
    return rows;
  });
}
