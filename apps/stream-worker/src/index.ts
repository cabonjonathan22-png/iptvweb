/**
 * Relais de flux sur Cloudflare Workers : même rôle et mêmes jetons que le proxy
 * Node (apps/stream-proxy), mais le trafic sortant n'y est pas facturé. Il fait
 * passer le direct, les films et les séries ; le proxy Render ne sert plus que
 * de secours et pour convertir les MKV (ffmpeg, absent des Workers).
 *
 * Jetons : AES-256-GCM, format de packages/shared/src/stream-token.ts, réimplémenté
 * ici avec WebCrypto (un Worker n'a pas node:crypto).
 */
import { isLocalHostname, isPrivateIp } from '../../../packages/shared/src/net-guard.ts';

export interface Env {
  STREAM_PROXY_SECRET: string;
}

interface StreamTarget {
  u: string;
  ua?: string;
  ref?: string;
  exp: number;
}

const DEFAULT_UA = 'VLC/3.0.21 LibVLC/3.0.21';
const CHILD_TTL_SEC = 6 * 3600;
const MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;
const TRANSIENT_STATUS = new Set([403, 429, 458, 500, 502, 503, 504, 509, 520, 521, 522, 524]);
const UPSTREAM_RETRY_MS = [300, 900];

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Access-Control-Max-Age': '600',
};

/* -------------------------------------------------------------- Jetons */

const keys = new Map<string, Promise<CryptoKey>>();
function key(secret: string): Promise<CryptoKey> {
  let k = keys.get(secret);
  if (!k) {
    k = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode('oria-stream-v1:' + secret))
      .then((raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
    keys.set(secret, k);
  }
  return k;
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function openStream(token: string, secret: string): Promise<StreamTarget | null> {
  try {
    const raw = fromB64url(token);
    if (raw.length < 29) return null;
    // Node écrit iv | tag | chiffré ; WebCrypto attend chiffré | tag.
    const iv = raw.subarray(0, 12);
    const data = new Uint8Array(raw.length - 12);
    data.set(raw.subarray(28));
    data.set(raw.subarray(12, 28), raw.length - 28);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await key(secret), data);
    const t = JSON.parse(new TextDecoder().decode(plain)) as StreamTarget;
    if (typeof t.u !== 'string' || typeof t.exp !== 'number' || t.exp < Date.now() / 1000) return null;
    return t;
  } catch {
    return null;
  }
}

async function sealStream(t: StreamTarget, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(JSON.stringify(t))));
  const ct = out.subarray(0, out.length - 16);
  const tag = out.subarray(out.length - 16);
  const all = new Uint8Array(12 + 16 + ct.length);
  all.set(iv);
  all.set(tag, 12);
  all.set(ct, 28);
  return toB64url(all);
}

function fileName(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').pop() || '';
    return last.replace(/[^A-Za-z0-9._-]/g, '').slice(-60) || 'stream';
  } catch {
    return 'stream';
  }
}

/* ---------------------------------------------------------- Sécurité, HLS */

function allowed(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  return !isLocalHostname(host) && !isPrivateIp(host);
}

function isPlaylist(url: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('mpegurl')) return true;
  if (ct.startsWith('video/') || ct.startsWith('audio/') || ct.includes('mp2t')) return false;
  return /\.m3u8?(\?|$)/i.test(url);
}

/** Réécrit segments, clés et sous-playlists vers ce relais. */
async function rewrite(text: string, baseUrl: string, wrap: (u: string) => Promise<string>): Promise<string> {
  const abs = (u: string) => {
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return null;
    }
  };
  const lines = text.split(/\r?\n/);
  const targets = new Map<string, string>();
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
    const found = l.charAt(0) !== '#' ? [l] : Array.from(l.matchAll(/URI="([^"]+)"/g), (m) => m[1]!);
    for (const u of found) {
      const a = abs(u);
      if (a) targets.set(u, a);
    }
  }
  const wrapped = new Map<string, string>();
  await Promise.all(Array.from(targets, async ([u, a]) => wrapped.set(u, await wrap(a))));
  return lines
    .map((line) => {
      const l = line.trim();
      if (!l) return line;
      if (l.charAt(0) !== '#') return wrapped.get(l) || line;
      return l.replace(/URI="([^"]+)"/g, (m, u: string) => (wrapped.has(u) ? 'URI="' + wrapped.get(u) + '"' : m));
    })
    .join('\n');
}

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/* ---------------------------------------------------------------- Relais */

async function upstream(target: StreamTarget, range: string | null, signal: AbortSignal): Promise<{ res: Response; url: string } | Response> {
  const headers: Record<string, string> = { 'User-Agent': target.ua || DEFAULT_UA, Accept: '*/*' };
  if (target.ref) headers.Referer = target.ref;
  if (range) headers.Range = range;
  for (let attempt = 0; ; attempt++) {
    let current = target.u;
    let res: Response | null = null;
    try {
      // Redirections suivies à la main : chaque saut est revérifié.
      for (let hop = 0; hop < 5; hop++) {
        if (hop > 0 && !allowed(current)) return text(403, 'redirect not allowed');
        const r = await fetch(current, { headers, redirect: 'manual', signal });
        const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
        if (!loc) {
          res = r;
          break;
        }
        await r.body?.cancel();
        current = new URL(loc, current).toString();
      }
    } catch (e) {
      if (signal.aborted || attempt >= UPSTREAM_RETRY_MS.length) return text(502, 'upstream unreachable: ' + (e as Error).message);
    }
    // Refus passagers (limite de connexions juste après un zapping…) : réessayés ici.
    if (res && (!TRANSIENT_STATUS.has(res.status) || attempt >= UPSTREAM_RETRY_MS.length)) return { res, url: current };
    if (res) await res.body?.cancel();
    if (attempt >= UPSTREAM_RETRY_MS.length) return text(502, 'too many redirects');
    await new Promise((r) => setTimeout(r, UPSTREAM_RETRY_MS[attempt]));
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/health') return text(200, 'ok');
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'method');

    const m = /^\/s\/([A-Za-z0-9_-]+)(?:\/[^/]*)?$/.exec(url.pathname);
    const target = m ? await openStream(m[1]!, env.STREAM_PROXY_SECRET) : null;
    if (!target) return text(403, 'invalid or expired token');
    if (!allowed(target.u)) return text(403, 'upstream not allowed');

    const got = await upstream(target, req.headers.get('range'), req.signal);
    if (got instanceof Response) return got;
    const { res: up, url: finalUrl } = got;

    const contentType = up.headers.get('content-type') || '';
    if (up.ok && isPlaylist(finalUrl, contentType)) {
      const buf = await up.arrayBuffer();
      if (buf.byteLength > MAX_PLAYLIST_BYTES) return text(502, 'playlist too large');
      const body = new TextDecoder().decode(buf);
      if (!body.trimStart().startsWith('#EXTM3U')) return text(502, 'invalid playlist');
      const exp = Math.floor(Date.now() / 1000) + CHILD_TTL_SEC;
      const out = await rewrite(body, finalUrl, async (u) =>
        url.origin + '/s/' + (await sealStream({ u, ua: target.ua, ref: target.ref, exp }, env.STREAM_PROXY_SECRET)) + '/' + fileName(u),
      );
      return new Response(req.method === 'HEAD' ? null : out, {
        headers: { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' },
      });
    }

    // Média : relayé tel quel (statut 200/206, plages), en flux.
    const headers: Record<string, string> = { ...CORS, 'Cache-Control': 'no-cache' };
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const v = up.headers.get(h);
      if (v) headers[h] = v;
    }
    if (req.method === 'HEAD') {
      await up.body?.cancel();
      return new Response(null, { status: up.status, headers });
    }
    return new Response(up.body, { status: up.status, headers });
  },
};
