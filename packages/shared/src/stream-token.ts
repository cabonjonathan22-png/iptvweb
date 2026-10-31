/**
 * Jetons de lecture partagés entre l'API (qui les émet) et le proxy de flux
 * (qui les ouvre). Le contenu est CHIFFRÉ (AES-256-GCM), pas seulement signé :
 * l'URL d'origine contient souvent les identifiants Xtream, que la TV ne doit
 * jamais voir.
 *
 * Module Node uniquement (node:crypto) : exporté via `@iptv/shared/stream-token`,
 * jamais depuis l'index (importé par l'app TV).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface StreamTarget {
  /** URL d'origine. */
  u: string;
  /** User-Agent / Referer à transmettre à l'origine. */
  ua?: string;
  ref?: string;
  /** Expiration (secondes epoch). */
  exp: number;
}

const keyCache = new Map<string, Buffer>();
function key(secret: string): Buffer {
  let k = keyCache.get(secret);
  if (!k) {
    k = createHash('sha256').update('oria-stream-v1:' + secret).digest();
    keyCache.set(secret, k);
  }
  return k;
}

export function sealStream(t: StreamTarget, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(t), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

/** Retourne la cible, ou null si le jeton est invalide, falsifié ou expiré. */
export function openStream(token: string, secret: string, nowSec = Date.now() / 1000): StreamTarget | null {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', key(secret), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const t = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')) as StreamTarget;
    if (typeof t.u !== 'string' || typeof t.exp !== 'number' || t.exp < nowSec) return null;
    return t;
  } catch {
    return null;
  }
}

/** Nom de fichier lisible en fin d'URL proxy (certains lecteurs natifs se fient à l'extension). */
export function streamFileName(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').pop() || '';
    const clean = last.replace(/[^A-Za-z0-9._-]/g, '').slice(-60);
    return clean || 'stream';
  } catch {
    return 'stream';
  }
}

export function proxiedUrl(proxyBase: string, t: StreamTarget, secret: string): string {
  return proxyBase.replace(/\/$/, '') + '/s/' + sealStream(t, secret) + '/' + streamFileName(t.u);
}

/** Réécrit les URI d'une playlist HLS (lignes média + attributs URI="…"). */
export function rewriteHlsPlaylist(text: string, baseUrl: string, wrap: (absoluteUrl: string) => string): string {
  const abs = (u: string) => {
    try {
      return wrap(new URL(u, baseUrl).toString());
    } catch {
      return u;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const l = line.trim();
      if (!l) return line;
      if (l.charAt(0) !== '#') return abs(l);
      return l.indexOf('URI="') >= 0 ? l.replace(/URI="([^"]+)"/g, (_m, u: string) => 'URI="' + abs(u) + '"') : line;
    })
    .join('\n');
}
