import { storage } from './storage';

/**
 * Copie locale des positions de lecture (50 dernières) : la reprise fonctionne
 * même si le dernier envoi au serveur a échoué (coupure réseau, TV éteinte).
 */
type Entry = [position: number, duration: number, savedAt: number];
const KEY = 'progress';
const MAX = 50;

function read(): { [k: string]: Entry } {
  return storage.getPref<{ [k: string]: Entry }>(KEY, {});
}

export function saveLocal(kind: string, id: number, position: number, duration: number) {
  const all = read();
  all[kind + ':' + id] = [Math.round(position), Math.round(duration), Date.now()];
  const keys = Object.keys(all);
  if (keys.length > MAX) {
    keys.sort((a, b) => all[a]![2] - all[b]![2]);
    for (let i = 0; i < keys.length - MAX; i++) delete all[keys[i]!];
  }
  storage.setPref(KEY, all);
}

/** Position locale si elle est plus récente que celle du serveur (ou s'il n'en a pas). */
export function localPosition(kind: string, id: number): number | null {
  const e = read()[kind + ':' + id];
  return e ? e[0] : null;
}
