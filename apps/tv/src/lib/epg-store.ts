import type { EpgNowNext } from '@iptv/shared';
import { api } from './api';

/**
 * Cache « programme en cours / suivant » côté TV. Les demandes des lignes
 * visibles sont regroupées (un seul appel pour ~15 chaînes) et gardées 60 s
 * ou jusqu'à la fin du programme en cours.
 */
const cache: { [epgId: string]: { v: EpgNowNext; until: number } } = {};
let queue: string[] = [];
let timer = 0;
const listeners: Array<() => void> = [];

export function onEpgChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function flush() {
  timer = 0;
  const ids = queue.slice(0, 100);
  queue = queue.slice(100);
  if (queue.length) timer = window.setTimeout(flush, 50);
  if (!ids.length) return;
  api
    .epgNow(ids)
    .then((res) => {
      const now = Date.now();
      for (const id of ids) {
        const v = res[id] || { now: null, next: null };
        cache[id] = { v, until: Math.min(now + 60_000, v.now ? v.now.stop : now + 60_000) };
      }
      for (let i = 0; i < listeners.length; i++) listeners[i]!();
    })
    .catch(() => undefined);
}

/** Valeur en cache (peut être périmée) ; déclenche un rafraîchissement si besoin. */
export function epgFor(epgId: string | null): EpgNowNext | undefined {
  if (!epgId) return undefined;
  const c = cache[epgId];
  if ((!c || c.until < Date.now()) && queue.indexOf(epgId) < 0) {
    queue.push(epgId);
    if (!timer) timer = window.setTimeout(flush, 80);
  }
  return c ? c.v : undefined;
}

/** Avancement (0..1) du programme en cours. */
export function progressOf(p: { start: number; stop: number } | null | undefined): number {
  if (!p) return 0;
  return Math.max(0, Math.min(1, (Date.now() - p.start) / (p.stop - p.start)));
}
