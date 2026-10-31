/** localStorage uniquement pour le token et les préférences (tout le reste vient de l'API). */

const TOKEN_KEY = 'oria.token';

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch (_) {
    /* stockage indisponible (mode privé, quota) : on continue sans persistance */
  }
}

let memToken: string | null = safeGet(TOKEN_KEY);

export const storage = {
  getToken: () => memToken,
  setToken(t: string | null) {
    memToken = t;
    safeSet(TOKEN_KEY, t);
  },
  getPref<T>(key: string, fallback: T): T {
    const raw = safeGet('oria.pref.' + key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (_) {
      return fallback;
    }
  },
  setPref(key: string, value: unknown) {
    safeSet('oria.pref.' + key, JSON.stringify(value));
  },
};
