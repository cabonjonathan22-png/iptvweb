import { and, asc, count, eq, notInArray, sql } from 'drizzle-orm';
import type { TvCategory } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { apiError } from '@/lib/http';
import { cachedJson, tvContext } from '@/lib/tv-api';

const TABLES = { live: schema.channels, vod: schema.vodItems, series: schema.series } as const;

/**
 * Catégories visibles (?kind=live|vod|series), dans l'ordre choisi par
 * l'utilisateur, avec leur nombre d'éléments. Les catégories verrouillées sont
 * listées (avec `locked`) pour que la TV puisse proposer la saisie du PIN.
 */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const kind = new URL(req.url).searchParams.get('kind') as keyof typeof TABLES;
  if (!TABLES[kind]) return apiError(400, 'bad_kind');
  return cachedJson(req, ctx, async (): Promise<TvCategory[]> => {
    const db = await getDb();
    const c = schema.categories;
    const t = TABLES[kind];
    return db
      .select({ id: c.id, name: sql<string>`coalesce(${c.customName}, ${c.name})`, locked: c.locked, count: count(t.id) })
      .from(c)
      .innerJoin(t, eq(t.categoryId, c.id))
      .where(
        and(
          eq(c.playlistId, ctx.playlist.id),
          eq(c.kind, kind),
          eq(c.hidden, false),
          ctx.excludedCategories.length ? notInArray(c.id, ctx.excludedCategories) : undefined,
        ),
      )
      .groupBy(c.id)
      .orderBy(asc(c.sortOrder), asc(c.id));
  });
}
