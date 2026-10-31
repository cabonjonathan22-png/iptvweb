import { Ratelimit } from '@upstash/ratelimit';
import { getRedis, hasUpstash } from './kv';

type Window = `${number} s` | `${number} m`;

export interface Limiter {
  limit(id: string): Promise<{ success: boolean; reset: number }>;
}

const toMs = (w: Window) => parseInt(w, 10) * (w.endsWith('m') ? 60_000 : 1000);

const g = globalThis as unknown as { __memRl?: Map<string, { n: number; reset: number }> };

/** Fenêtre fixe en mémoire pour le dev. */
function memoryLimiter(prefix: string, max: number, window: Window): Limiter {
  const store = (g.__memRl ??= new Map());
  return {
    async limit(id) {
      const key = prefix + ':' + id;
      const now = Date.now();
      let e = store.get(key);
      if (!e || e.reset <= now) {
        e = { n: 0, reset: now + toMs(window) };
        store.set(key, e);
      }
      e.n++;
      return { success: e.n <= max, reset: e.reset };
    },
  };
}

const cache = new Map<string, Limiter>();

export function limiter(prefix: string, max: number, window: Window): Limiter {
  let l = cache.get(prefix);
  if (!l) {
    l = hasUpstash()
      ? new Ratelimit({
          redis: getRedis(),
          limiter: Ratelimit.slidingWindow(max, window),
          prefix: 'rl:' + prefix,
        })
      : memoryLimiter(prefix, max, window);
    cache.set(prefix, l);
  }
  return l;
}

/** Limites des endpoints sensibles, centralisées. */
export const limits = {
  /** Création de codes : 6 / minute / IP. */
  pairStart: () => limiter('pair-start', 6, '1 m'),
  /** Polling toutes les 3 s => 20 / min ; marge pour 2 TV derrière la même IP. */
  pairStatus: () => limiter('pair-status', 60, '1 m'),
  /** Saisie de code côté dashboard : 10 essais / 10 min / utilisateur (anti brute-force). */
  pairConfirm: () => limiter('pair-confirm', 10, '10 m'),
};
