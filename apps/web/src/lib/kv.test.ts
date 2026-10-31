import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.PGLITE_DIR = path.join(os.tmpdir(), 'oria-kv-test-' + Date.now());
  process.env.KV_BACKEND = 'postgres';
});

describe('Postgres KV + rate limiting (sans Upstash)', () => {
  it('stores with TTL and honours NX', async () => {
    const { getKv } = await import('./kv');
    const kv = getKv();
    expect(await kv.set('pair:ABC', { a: 1 }, { ex: 60, nx: true })).toBe(true);
    expect(await kv.set('pair:ABC', { a: 2 }, { ex: 60, nx: true })).toBe(false);
    expect(await kv.get('pair:ABC')).toEqual({ a: 1 });
    expect(await kv.ttl('pair:ABC')).toBeGreaterThan(50);
    await kv.set('pair:ABC', { a: 3 }, { ex: 60 });
    expect(await kv.get('pair:ABC')).toEqual({ a: 3 });
    await kv.del('pair:ABC');
    expect(await kv.get('pair:ABC')).toBeNull();
    // Une entrée expirée est invisible et remplaçable en NX.
    await kv.set('old', 1, { ex: -1 });
    expect(await kv.get('old')).toBeNull();
    expect(await kv.set('old', 2, { ex: 60, nx: true })).toBe(true);
  }, 60_000);

  it('limits requests in a fixed window', async () => {
    const { limiter } = await import('./ratelimit');
    const l = limiter('test', 3, '1 m');
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await l.limit('ip-1')).success);
    expect(results).toEqual([true, true, true, false, false]);
    expect((await l.limit('ip-2')).success).toBe(true);
  }, 60_000);
});
