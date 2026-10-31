/**
 * Petit KV avec TTL (codes de pairing, verrous).
 *  - Upstash Redis si configuré (UPSTASH_REDIS_REST_* ou KV_REST_API_* injectées par Vercel) ;
 *  - sinon Postgres (table kv_store) : aucun service supplémentaire à créer ;
 *  - en dev sans base distante : Map en mémoire (un seul process `next dev`).
 */
import { Redis } from '@upstash/redis';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { getDb, schema } from './db';

export interface Kv {
  get<T>(key: string): Promise<T | null>;
  /** Retourne false si `nx` est demandé et que la clé existe déjà. */
  set(key: string, value: unknown, opts: { ex: number; nx?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  ttl(key: string): Promise<number>;
}

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function hasUpstash(): boolean {
  return upstashEnv() !== null;
}

let redis: Redis | null = null;
export function getRedis(): Redis {
  if (!redis) redis = new Redis(upstashEnv()!);
  return redis;
}

function upstashKv(): Kv {
  const r = getRedis();
  return {
    get: (key) => r.get(key),
    async set(key, value, { ex, nx }) {
      const res = nx ? await r.set(key, value, { ex, nx: true }) : await r.set(key, value, { ex });
      return res === 'OK';
    },
    async del(key) {
      await r.del(key);
    },
    ttl: (key) => r.ttl(key),
  };
}

function postgresKv(): Kv {
  const k = schema.kvStore;
  return {
    async get<T>(key: string) {
      const db = await getDb();
      const [row] = await db
        .select({ value: k.value })
        .from(k)
        .where(and(eq(k.key, key), gt(k.expiresAt, new Date())));
      return row ? (row.value as T) : null;
    },
    async set(key, value, { ex, nx }) {
      const db = await getDb();
      const expiresAt = new Date(Date.now() + ex * 1000);
      // NX : on ne remplace qu'une entrée expirée.
      const rows = await db
        .insert(k)
        .values({ key, value: value as never, expiresAt })
        .onConflictDoUpdate({
          target: k.key,
          set: { value: sql`excluded.value`, expiresAt: sql`excluded.expires_at` },
          ...(nx ? { setWhere: lt(k.expiresAt, new Date()) } : {}),
        })
        .returning({ key: k.key });
      return rows.length > 0;
    },
    async del(key) {
      const db = await getDb();
      await db.delete(k).where(eq(k.key, key));
    },
    async ttl(key) {
      const db = await getDb();
      const [row] = await db.select({ e: k.expiresAt }).from(k).where(and(eq(k.key, key), gt(k.expiresAt, new Date())));
      return row ? Math.ceil((row.e.getTime() - Date.now()) / 1000) : -2;
    },
  };
}

type Entry = { v: string; exp: number };
const g = globalThis as unknown as { __memKv?: Map<string, Entry> };

function memoryKv(): Kv {
  const store = (g.__memKv ??= new Map());
  const live = (key: string) => {
    const e = store.get(key);
    if (e && e.exp <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return e;
  };
  return {
    async get<T>(key: string) {
      const e = live(key);
      return e ? (JSON.parse(e.v) as T) : null;
    },
    async set(key, value, { ex, nx }) {
      if (nx && live(key)) return false;
      store.set(key, { v: JSON.stringify(value), exp: Date.now() + ex * 1000 });
      return true;
    },
    async del(key) {
      store.delete(key);
    },
    async ttl(key) {
      const e = live(key);
      return e ? Math.ceil((e.exp - Date.now()) / 1000) : -2;
    },
  };
}

/** Backend persistant partagé entre instances (Upstash ou Postgres) ? */
export function sharedBackend(): 'upstash' | 'postgres' | 'memory' {
  if (process.env.KV_BACKEND === 'postgres') return 'postgres';
  if (hasUpstash()) return 'upstash';
  if (process.env.DATABASE_URL) return 'postgres';
  return 'memory';
}

let kv: Kv | null = null;
export function getKv(): Kv {
  if (!kv) {
    const b = sharedBackend();
    kv = b === 'upstash' ? upstashKv() : b === 'postgres' ? postgresKv() : memoryKv();
  }
  return kv;
}

/** Purge des entrées expirées (appelée par le cron). */
export async function purgeExpiredKv() {
  if (sharedBackend() !== 'postgres') return;
  const db = await getDb();
  await db.delete(schema.kvStore).where(lt(schema.kvStore.expiresAt, new Date()));
}
