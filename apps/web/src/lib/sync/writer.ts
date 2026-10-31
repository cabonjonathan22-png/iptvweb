/**
 * Écriture des contenus d'une synchro, par lots.
 *
 * - Upsert sur (playlist_id, external_id) : les ids restent stables d'une synchro
 *   à l'autre (favoris et reprises survivent).
 * - Chaque ligne vue reçoit la génération courante ; `finalize()` supprime ce qui
 *   n'a pas été revu (contenus retirés par le fournisseur).
 * - Les personnalisations de catégories (nom, ordre, masquage, verrou) ne sont
 *   jamais écrasées par une resynchro.
 */
import { and, count, eq, getTableColumns, lt, max, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import type { ContentKind } from '@iptv/shared';
import { schema, type DB } from '../db';

const { categories, channels, vodItems, series, episodes } = schema;

export type ChannelRow = typeof channels.$inferInsert;
export type VodRow = typeof vodItems.$inferInsert;
export type SeriesRow = typeof series.$inferInsert;
export type EpisodeRow = typeof episodes.$inferInsert;

export const hashId = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 20);

/** SET col = excluded.col pour chaque clé (hors clés de conflit). */
function excludedSet<T extends PgTable>(table: T, keys: string[]): Record<string, SQL> {
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  const set: Record<string, SQL> = {};
  for (const k of keys) set[k] = sql.raw(`excluded."${cols[k]!.name}"`);
  return set;
}

/** Une même URL peut apparaître deux fois : ON CONFLICT refuse deux lignes identiques par requête. */
function dedupe<T extends { externalId: string }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.externalId, r);
  return m.size === rows.length ? rows : Array.from(m.values());
}

const CHANNEL_UPDATE = excludedSet(channels, [
  'categoryId', 'num', 'name', 'logo', 'streamUrl', 'epgChannelId', 'catchup', 'catchupDays',
  'httpUserAgent', 'httpReferrer', 'sortOrder', 'syncGen',
]);
const VOD_UPDATE = excludedSet(vodItems, [
  'categoryId', 'name', 'poster', 'year', 'rating', 'containerExt', 'streamUrl', 'addedAt', 'sortOrder', 'syncGen',
]);
const SERIES_UPDATE = excludedSet(series, [
  'categoryId', 'name', 'poster', 'backdrop', 'plot', 'year', 'rating', 'cast', 'genre', 'addedAt', 'sortOrder', 'syncGen',
]);
const EPISODE_UPDATE = excludedSet(episodes, [
  'season', 'episode', 'title', 'thumb', 'containerExt', 'streamUrl', 'syncGen',
]);
const CATEGORY_UPDATE = excludedSet(categories, ['name', 'syncGen']);

export interface CategoryInput {
  kind: ContentKind;
  externalId: string;
  name: string;
}

export class ContentWriter {
  private cats = new Map<string, number>();
  /** Catégories déjà réécrites avec la génération courante pendant cette invocation. */
  private touched = new Set<string>();
  private nextOrder = 0;

  constructor(
    private db: DB,
    readonly playlistId: string,
    readonly gen: number,
  ) {}

  async init() {
    const rows = await this.db
      .select({ id: categories.id, kind: categories.kind, externalId: categories.externalId })
      .from(categories)
      .where(eq(categories.playlistId, this.playlistId));
    for (const r of rows) this.cats.set(r.kind + '|' + r.externalId, r.id);
    const [m] = await this.db
      .select({ v: max(categories.sortOrder) })
      .from(categories)
      .where(eq(categories.playlistId, this.playlistId));
    this.nextOrder = m?.v === null || m?.v === undefined ? 0 : m.v + 1;
  }

  categoryId(kind: ContentKind, externalId: string | null): number | null {
    return externalId === null ? null : (this.cats.get(kind + '|' + externalId) ?? null);
  }

  async ensureCategories(list: CategoryInput[]) {
    const todo = new Map<string, CategoryInput>();
    for (const c of list) {
      const key = c.kind + '|' + c.externalId;
      if (!this.touched.has(key)) todo.set(key, c);
    }
    if (!todo.size) return;
    const values = Array.from(todo.values()).map((c) => ({
      playlistId: this.playlistId,
      kind: c.kind,
      externalId: c.externalId,
      name: c.name.slice(0, 200) || 'Sans nom',
      // Utilisé seulement à l'insertion : l'ordre choisi par l'utilisateur est conservé.
      sortOrder: this.nextOrder++,
      syncGen: this.gen,
    }));
    for (let i = 0; i < values.length; i += 500) {
      const rows = await this.db
        .insert(categories)
        .values(values.slice(i, i + 500))
        .onConflictDoUpdate({ target: [categories.playlistId, categories.kind, categories.externalId], set: CATEGORY_UPDATE })
        .returning({ id: categories.id, kind: categories.kind, externalId: categories.externalId });
      for (const r of rows) {
        const key = r.kind + '|' + r.externalId;
        this.cats.set(key, r.id);
        this.touched.add(key);
      }
    }
  }

  async upsertChannels(rows: ChannelRow[]) {
    if (!rows.length) return;
    await this.db
      .insert(channels)
      .values(dedupe(rows))
      .onConflictDoUpdate({ target: [channels.playlistId, channels.externalId], set: CHANNEL_UPDATE });
  }

  async upsertVod(rows: VodRow[]) {
    if (!rows.length) return;
    await this.db
      .insert(vodItems)
      .values(dedupe(rows))
      .onConflictDoUpdate({ target: [vodItems.playlistId, vodItems.externalId], set: VOD_UPDATE });
  }

  /** Retourne external_id -> id (nécessaire pour rattacher les épisodes M3U). */
  async upsertSeries(rows: SeriesRow[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!rows.length) return out;
    const res = await this.db
      .insert(series)
      .values(dedupe(rows))
      .onConflictDoUpdate({ target: [series.playlistId, series.externalId], set: SERIES_UPDATE })
      .returning({ id: series.id, externalId: series.externalId });
    for (const r of res) out.set(r.externalId, r.id);
    return out;
  }

  async upsertEpisodes(rows: EpisodeRow[]) {
    if (!rows.length) return;
    await this.db
      .insert(episodes)
      .values(dedupe(rows))
      .onConflictDoUpdate({ target: [episodes.seriesId, episodes.externalId], set: EPISODE_UPDATE });
  }

  /**
   * Purge des contenus non revus et comptage final.
   * `keepEpisodes` : les épisodes Xtream sont chargés à la demande, hors synchro.
   */
  async finalize(opts: { keepEpisodes: boolean }) {
    const pid = this.playlistId;
    const stale = <T extends typeof channels | typeof vodItems | typeof series | typeof episodes | typeof categories>(t: T) =>
      this.db.delete(t).where(and(eq(t.playlistId, pid), lt(t.syncGen, this.gen)));
    if (!opts.keepEpisodes) await stale(episodes);
    await stale(channels);
    await stale(vodItems);
    await stale(series);
    await stale(categories);

    const c = async (t: typeof channels | typeof vodItems | typeof series) =>
      (await this.db.select({ n: count() }).from(t).where(eq(t.playlistId, pid)))[0]?.n ?? 0;
    return { liveCount: await c(channels), vodCount: await c(vodItems), seriesCount: await c(series) };
  }
}
