/**
 * Listes paginées partagées par les endpoints chaînes / films / séries :
 * catégorie (id), « all » ou « fav » (favoris de l'utilisateur), avec
 * respect du masquage et du verrouillage parental.
 */
import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { getDb, schema } from './db';
import { apiError } from './http';
import { lockedError, visibleCategory, type TvContext } from './tv-api';

export type ListCategory = number | 'all' | 'fav';

export function parseListParams(req: Request) {
  const sp = new URL(req.url).searchParams;
  const raw = sp.get('category') || 'all';
  const category: ListCategory | null = raw === 'all' || raw === 'fav' ? raw : /^\d+$/.test(raw) ? Number(raw) : null;
  return {
    category,
    offset: Math.max(0, Number(sp.get('offset')) || 0),
    limit: Math.min(200, Math.max(1, Number(sp.get('limit')) || 100)),
  };
}

type Table = typeof schema.channels | typeof schema.vodItems | typeof schema.series;
const FAV_KIND = new Map<Table, 'live' | 'vod' | 'series'>([
  [schema.channels, 'live'],
  [schema.vodItems, 'vod'],
  [schema.series, 'series'],
]);

/** Construit filtre + tri, ou une réponse d'erreur (catégorie verrouillée / invalide). */
export async function listQuery(ctx: TvContext, t: Table, category: ListCategory | null) {
  if (category === null) return apiError(400, 'bad_category');
  const c = schema.categories;
  const parts: (SQL | undefined)[] = [eq(t.playlistId, ctx.playlist.id), visibleCategory(t.categoryId, ctx.lockedOk)];
  let order: SQL[];
  if (typeof category === 'number') {
    const db = await getDb();
    const cat = await db.query.categories.findFirst({ where: and(eq(c.id, category), eq(c.playlistId, ctx.playlist.id)) });
    if (!cat) return apiError(404, 'not_found');
    if (cat.locked && !ctx.lockedOk) return lockedError();
    parts.push(eq(t.categoryId, category));
    order = [asc(t.sortOrder), asc(t.id)];
  } else if (category === 'fav') {
    const f = schema.favorites;
    parts.push(
      inArray(
        t.id,
        sql`(select ${f.itemId} from ${f} where ${f.userId} = ${ctx.device.userId} and ${f.kind} = ${FAV_KIND.get(t)!})`,
      ),
    );
    order = [asc(t.sortOrder), asc(t.id)];
  } else if (t === schema.channels) {
    // « Toutes les chaînes » : ordre des numéros, cohérent avec le zapping.
    order = [asc(schema.channels.num), asc(t.id)];
  } else {
    // « Tous les films / séries » : les plus récents d'abord.
    const added = t === schema.vodItems ? schema.vodItems.addedAt : schema.series.addedAt;
    order = [sql`${added} desc nulls last`, desc(t.id)];
  }
  return { where: and(...parts)!, order };
}

export async function countWhere(t: Table, where: SQL) {
  const db = await getDb();
  const [r] = await db.select({ n: count() }).from(t).leftJoin(schema.categories, eq(schema.categories.id, t.categoryId)).where(where);
  return r?.n ?? 0;
}
