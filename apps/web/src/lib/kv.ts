/**
 * Petit KV avec TTL : Upstash Redis en production, Map en mémoire en dev
 * (suffisant pour un unique process `next dev`, pas pour du multi-instance).
 */
import { Redis } from '@upstash/redis';

export interface Kv {
  get<T>(key: string): Promise<T | null>;
  /** Retourne false si `nx` est demandé et que la clé existe déjà. */
  set(key: string, value: unknown, opts: { ex: number; nx?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  ttl(key: string): Promise<number>;
}

export function hasUpstash(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

let redis: Redis | null = null;
export function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
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

let kv: Kv | null = null;
export function getKv(): Kv {
  if (!kv) {
    if (hasUpstash()) kv = upstashKv();
    else if (process.env.VERCEL) throw new Error('UPSTASH_REDIS_REST_URL / _TOKEN manquants');
    else kv = memoryKv();
  }
  return kv;
}
