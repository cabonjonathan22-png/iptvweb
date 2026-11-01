import { ApiError, createTvApi, type Transport } from '@iptv/shared';
import { storage } from './storage';
import { flags, SLOW_NETWORK_DELAY_MS } from './devflags';
import { getUnlock } from './session';

export const API_URL: string = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * Transport XMLHttpRequest : disponible partout, y compris sur les WebKit TV
 * qui n'ont pas `fetch`. Status 0 => erreur réseau (hors ligne, CORS, timeout).
 */
const xhrTransport: Transport = (req) =>
  new Promise((resolve, reject) => {
    const send = () => {
      const xhr = new XMLHttpRequest();
      xhr.open(req.method, API_URL + req.path, true);
      xhr.timeout = 15000;
      xhr.setRequestHeader('Accept', 'application/json');
      if (req.body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
      const h = req.headers || {};
      for (const k in h) xhr.setRequestHeader(k, h[k]!);
      xhr.onload = () => {
        let data: unknown = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (_) {
          data = null;
        }
        resolve({ status: xhr.status, data });
      };
      const fail = () => reject(new ApiError(0, 'network', 'Connexion impossible au serveur.'));
      xhr.onerror = fail;
      xhr.ontimeout = fail;
      xhr.send(req.body !== undefined ? JSON.stringify(req.body) : null);
    };
    if (flags.slow) window.setTimeout(send, SLOW_NETWORK_DELAY_MS);
    else send();
  });

let onUnauthorized: (() => void) | null = null;
/** Appelé sur toute réponse 401 (TV révoquée depuis le dashboard). */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

const TRANSIENT = [502, 503, 504];

/** Une lecture qui échoue sur un incident passager (réseau, démarrage du serveur) est retentée une fois. */
const resilient: Transport = (req) => {
  if (req.method !== 'GET') return xhrTransport(req);
  const again = () => new Promise<void>((r) => window.setTimeout(r, 600)).then(() => xhrTransport(req));
  return xhrTransport(req).then(
    (res) => (TRANSIENT.indexOf(res.status) >= 0 ? again() : res),
    () => again(),
  );
};

const guarded: Transport = (req) =>
  resilient(req).then((res) => {
    if (res.status === 401 && storage.getToken() && onUnauthorized) onUnauthorized();
    return res;
  });

export const api = createTvApi(guarded, storage.getToken, getUnlock);
export { ApiError };
