/**
 * Schéma Postgres complet (Drizzle). Il est posé dès l'étape 1 pour éviter
 * une cascade de migrations à chaque étape ; les tables de contenu sont
 * remplies à partir de l'étape 2 (synchro des playlists).
 *
 * Choix structurants :
 * - Les contenus (chaînes, VOD, séries, épisodes) ont un id bigint et une
 *   `external_id` stable (stream_id Xtream, ou hash de l'URL pour M3U).
 *   La synchro fait un upsert sur (playlist_id, external_id) : les ids restent
 *   stables d'une synchro à l'autre, donc favoris et reprises survivent.
 * - Recherche plein texte : index trigramme (pg_trgm) sur les noms, adapté aux
 *   recherches partielles "à la volée" du clavier virtuel.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  index,
  jsonb,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
/** Génération de synchro : tout ce qui n'a pas été revu par la dernière synchro est purgé. */
const syncGen = () => integer('sync_gen').notNull().default(0);

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

/* ------------------------------------------------------------------ Auth.js */

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ---------------------------------------------------------------- Playlists */

export const playlistType = pgEnum('playlist_type', ['m3u_url', 'm3u_file', 'xtream']);
export const playlistStatus = pgEnum('playlist_status', ['idle', 'syncing', 'ready', 'error']);
export const contentKind = pgEnum('content_kind', ['live', 'vod', 'series']);

export const playlists = pgTable(
  'playlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: playlistType('type').notNull(),
    /** URL M3U, ou clé de stockage du fichier uploadé. */
    sourceUrl: text('source_url'),
    /** Identifiants Xtream chiffrés AES-256-GCM (jamais renvoyés au client). */
    credentialsEnc: text('credentials_enc'),
    epgUrl: text('epg_url'),
    /** EPG Xtream automatique via xmltv.php. */
    epgAuto: boolean('epg_auto').notNull().default(false),
    status: playlistStatus('status').notNull().default('idle'),
    lastSyncAt: ts('last_sync_at'),
    lastError: text('last_error'),
    liveCount: integer('live_count').notNull().default(0),
    vodCount: integer('vod_count').notNull().default(0),
    seriesCount: integer('series_count').notNull().default(0),
    syncGen: syncGen(),
    /** Infos compte Xtream (expiration, connexions max), EPG trouvé dans l'en-tête M3U… */
    meta: jsonb('meta').$type<PlaylistMeta>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('playlists_user_idx').on(t.userId)],
);

export interface PlaylistMeta {
  /** Expiration de l'abonnement Xtream (ms epoch). */
  expiresAt?: number | null;
  maxConnections?: number | null;
  /** URL EPG annoncée par l'en-tête #EXTM3U. */
  headerEpgUrl?: string;
  /** Nom du fichier uploadé. */
  fileName?: string;
  /** Résultat de la dernière synchro du guide TV. */
  epgPrograms?: number;
  epgError?: string | null;
}

/** Fichier M3U uploadé, stocké compressé (gzip) : privé, sans service de stockage externe. */
export const playlistFiles = pgTable('playlist_files', {
  playlistId: uuid('playlist_id')
    .primaryKey()
    .references(() => playlists.id, { onDelete: 'cascade' }),
  gzData: bytea('gz_data').notNull(),
  size: integer('size').notNull(),
  uploadedAt: ts('uploaded_at').notNull().defaultNow(),
});

export const syncStatus = pgEnum('sync_status', ['queued', 'running', 'done', 'error']);

/**
 * Job de synchronisation découpé en phases. Chaque invocation de fonction
 * prend un « bail » (lease_until) pour être seule à travailler, avance le
 * curseur par lots, puis rend la main avant la limite de durée Vercel.
 */
export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    gen: integer('gen').notNull(),
    phase: text('phase').notNull(),
    /** Nombre d'éléments déjà traités dans la phase courante. */
    cursor: integer('cursor').notNull().default(0),
    status: syncStatus('status').notNull().default('queued'),
    leaseUntil: ts('lease_until'),
    error: text('error'),
    invocations: integer('invocations').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
  },
  (t) => [index('sync_jobs_playlist_idx').on(t.playlistId, t.createdAt)],
);

/**
 * Petit stockage clé-valeur avec expiration (codes de pairing, rate limiting)
 * quand Upstash Redis n'est pas configuré : une base Postgres suffit, donc un
 * service gratuit de moins à créer.
 */
export const kvStore = pgTable(
  'kv_store',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [index('kv_store_expires_idx').on(t.expiresAt)],
);

/* ------------------------------------------------------------------ Devices */

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** SHA-256 du device token : le token en clair n'existe que sur la TV. */
    tokenHash: text('token_hash').notNull(),
    playlistId: uuid('playlist_id').references(() => playlists.id, { onDelete: 'set null' }),
    userAgent: text('user_agent'),
    lastSeenAt: ts('last_seen_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('devices_token_hash_idx').on(t.tokenHash), index('devices_user_idx').on(t.userId)],
);

/* ------------------------------------------------------------------ Contenu */

export const categories = pgTable(
  'categories',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    kind: contentKind('kind').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    customName: text('custom_name'),
    sortOrder: integer('sort_order').notNull().default(0),
    hidden: boolean('hidden').notNull().default(false),
    /** Catégorie protégée par le code PIN parental. */
    locked: boolean('locked').notNull().default(false),
    syncGen: syncGen(),
  },
  (t) => [
    uniqueIndex('categories_ext_idx').on(t.playlistId, t.kind, t.externalId),
    index('categories_order_idx').on(t.playlistId, t.kind, t.sortOrder),
  ],
);

export const channels = pgTable(
  'channels',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id, {
      onDelete: 'set null',
    }),
    externalId: text('external_id').notNull(),
    num: integer('num'),
    name: text('name').notNull(),
    logo: text('logo'),
    /** URL directe (M3U). Pour Xtream, l'URL est reconstruite côté serveur. */
    streamUrl: text('stream_url'),
    epgChannelId: text('epg_channel_id'),
    catchup: text('catchup'),
    catchupDays: integer('catchup_days'),
    /** Modèle d'URL du replay (M3U : attribut catchup-source). */
    catchupSource: text('catchup_source'),
    httpUserAgent: text('http_user_agent'),
    httpReferrer: text('http_referrer'),
    sortOrder: integer('sort_order').notNull().default(0),
    syncGen: syncGen(),
  },
  (t) => [
    uniqueIndex('channels_ext_idx').on(t.playlistId, t.externalId),
    index('channels_cat_idx').on(t.playlistId, t.categoryId, t.sortOrder),
    index('channels_num_idx').on(t.playlistId, t.num),
    index('channels_name_trgm_idx').using('gin', sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

export const vodItems = pgTable(
  'vod_items',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id, {
      onDelete: 'set null',
    }),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    poster: text('poster'),
    backdrop: text('backdrop'),
    plot: text('plot'),
    year: integer('year'),
    durationSec: integer('duration_sec'),
    rating: real('rating'),
    cast: text('cast'),
    genre: text('genre'),
    containerExt: text('container_ext'),
    streamUrl: text('stream_url'),
    tmdbId: integer('tmdb_id'),
    director: text('director'),
    /** Fiche détaillée chargée (get_vod_info / TMDB) : une seule fois par film. */
    detailsFetchedAt: ts('details_fetched_at'),
    addedAt: ts('added_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    syncGen: syncGen(),
  },
  (t) => [
    uniqueIndex('vod_ext_idx').on(t.playlistId, t.externalId),
    index('vod_cat_idx').on(t.playlistId, t.categoryId, t.sortOrder),
    index('vod_added_idx').on(t.playlistId, t.addedAt),
    index('vod_name_trgm_idx').using('gin', sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

export const series = pgTable(
  'series',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id, {
      onDelete: 'set null',
    }),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    poster: text('poster'),
    backdrop: text('backdrop'),
    plot: text('plot'),
    year: integer('year'),
    rating: real('rating'),
    cast: text('cast'),
    genre: text('genre'),
    tmdbId: integer('tmdb_id'),
    addedAt: ts('added_at'),
    /** Les épisodes Xtream sont chargés à la demande (get_series_info) puis mis en cache. */
    episodesFetchedAt: ts('episodes_fetched_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    syncGen: syncGen(),
  },
  (t) => [
    uniqueIndex('series_ext_idx').on(t.playlistId, t.externalId),
    index('series_cat_idx').on(t.playlistId, t.categoryId, t.sortOrder),
    index('series_name_trgm_idx').using('gin', sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

export const episodes = pgTable(
  'episodes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    seriesId: bigint('series_id', { mode: 'number' })
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    season: integer('season').notNull(),
    episode: integer('episode').notNull(),
    title: text('title'),
    plot: text('plot'),
    thumb: text('thumb'),
    durationSec: integer('duration_sec'),
    containerExt: text('container_ext'),
    streamUrl: text('stream_url'),
    syncGen: syncGen(),
  },
  (t) => [
    uniqueIndex('episodes_ext_idx').on(t.seriesId, t.externalId),
    index('episodes_order_idx').on(t.seriesId, t.season, t.episode),
  ],
);

export const epgPrograms = pgTable(
  'epg_programs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    channelEpgId: text('channel_epg_id').notNull(),
    start: ts('start').notNull(),
    stop: ts('stop').notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => [
    index('epg_lookup_idx').on(t.playlistId, t.channelEpgId, t.start),
    // Purge des programmes terminés depuis plus de 24 h.
    index('epg_stop_idx').on(t.stop),
  ],
);

/* -------------------------------------------------------- Données utilisateur */

export const favorites = pgTable(
  'favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: contentKind('kind').notNull(),
    itemId: bigint('item_id', { mode: 'number' }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.itemId] })],
);

export const progressKind = pgEnum('progress_kind', ['live', 'vod', 'episode']);

export const watchProgress = pgTable(
  'watch_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: progressKind('kind').notNull(),
    itemId: bigint('item_id', { mode: 'number' }).notNull(),
    positionSec: integer('position_sec').notNull().default(0),
    durationSec: integer('duration_sec'),
    completed: boolean('completed').notNull().default(false),
    /** Appareil de la dernière lecture : sert à proposer la reprise sur un autre. */
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind, t.itemId] }),
    index('progress_recent_idx').on(t.userId, t.updatedAt),
  ],
);

export const playerMode = pgEnum('player_mode', ['auto', 'hls', 'ts']);

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  audioLang: text('audio_lang'),
  subtitleLang: text('subtitle_lang'),
  playerMode: playerMode('player_mode').notNull().default('auto'),
  /** Hash scrypt du code PIN parental. */
  parentalPinHash: text('parental_pin_hash'),
  livePreview: boolean('live_preview').notNull().default(true),
  /** Langues de contenu à afficher, séparées par des virgules ; null = toutes. */
  contentLangs: text('content_langs'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
