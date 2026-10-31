/**
 * Proxy de flux IPTV (à héberger sur un VPS, PAS sur Vercel).
 *
 * Pourquoi : les flux IPTV sont presque toujours en http:// et sans CORS ; une
 * page HTTPS ne peut pas les lire directement (mixed content). Ce proxy :
 *  - n'accepte que des jetons chiffrés émis par l'API (AES-GCM, secret partagé) :
 *    impossible de s'en servir comme proxy ouvert, et la TV ne voit jamais
 *    l'URL d'origine (identifiants Xtream) ;
 *  - réécrit les playlists HLS (segments, clés, init, pistes) vers lui-même ;
 *  - transmet User-Agent / Referer définis par la playlist ;
 *  - relaie les requêtes Range (avance rapide en VOD) et diffuse en flux continu (TS live) ;
 *  - ajoute les en-têtes CORS ; refuse les adresses réseau privées ;
 *  - convertit à la volée les conteneurs illisibles par les navigateurs (MKV…), cf. remux.ts.
 *
 * Aucune dépendance : Node ≥ 22.18 (types TypeScript retirés nativement).
 *   STREAM_PROXY_SECRET=… PORT=8080 node apps/stream-proxy/server.ts
 */
import http from 'node:http';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { openStream, proxiedUrl, rewriteHlsPlaylist, type StreamTarget } from '../../packages/shared/src/stream-token.ts';
import { isLocalHostname, isPrivateIp } from '../../packages/shared/src/net-guard.ts';
import { probe, servePlaylist, serveSegment, sourceKey, stopAllRemux } from './remux.ts';

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.STREAM_PROXY_SECRET || '';
/** URL publique du proxy (pour réécrire les playlists). Render la fournit ; sinon déduite de la requête. */
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_UPSTREAMS === '1';
const DEFAULT_UA = 'VLC/3.0.21 LibVLC/3.0.21';
const CHILD_TTL_SEC = 6 * 3600;
const MAX_PLAYLIST_BYTES = 8 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 15_000;

if (!SECRET || SECRET.length < 16) {
  console.error('STREAM_PROXY_SECRET manquant ou trop court (16 caractères minimum).');
  process.exit(1);
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Access-Control-Max-Age': '600',
};

/* -------------------------------------------------------------- Sécurité */

const dnsCache = new Map<string, { ok: boolean; until: number }>();

async function upstreamAllowed(raw: string): Promise<boolean> {
  if (ALLOW_PRIVATE) return true;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isLocalHostname(host)) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  const c = dnsCache.get(host);
  if (c && c.until > Date.now()) return c.ok;
  const addrs = await lookup(host, { all: true }).catch(() => []);
  const ok = addrs.length > 0 && !addrs.some((a) => isPrivateIp(a.address));
  dnsCache.set(host, { ok, until: Date.now() + 60_000 });
  return ok;
}

/* ---------------------------------------------------------------- Proxy */

function isPlaylist(url: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('mpegurl')) return true;
  if (ct.startsWith('video/') || ct.startsWith('audio/') || ct.includes('mp2t')) return false;
  return /\.m3u8?(\?|$)/i.test(url);
}

function send(res: http.ServerResponse, status: number, body: string) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }
  const url = new URL(req.url || '/', 'http://proxy');
  if (url.pathname === '/health') return send(res, 200, 'ok');
  if (url.pathname === '/version') return send(res, 200, JSON.stringify({ remux: true }));
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method');

  const remux = /^\/x\/([A-Za-z0-9_-]+)\/(?:info|(\d+)\/(\d+)\/(index\.m3u8|init\.mp4|seg\d+\.(?:ts|m4s)))$/.exec(url.pathname);
  if (remux) {
    const t = openStream(remux[1]!, SECRET);
    if (!t) return send(res, 403, 'invalid or expired token');
    if (!(await upstreamAllowed(t.u))) return send(res, 403, 'upstream not allowed');
    const key = sourceKey(t.u);
    // ffmpeg repasse par /s/ : mêmes contrôles et mêmes en-têtes que le reste.
    const input = 'http://127.0.0.1:' + PORT + '/s/' + remux[1];
    const file = remux[4];
    if (!file) {
      const info = await probe(key, input).catch(() => null);
      if (!info) return send(res, 502, 'probe failed');
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(info));
    }
    if (file === 'index.m3u8') return servePlaylist(res, CORS, send, key, input, Number(remux[2]), Number(remux[3]));
    return serveSegment(res, CORS, send, key, file);
  }

  const m = /^\/s\/([A-Za-z0-9_-]+)(?:\/[^/]*)?$/.exec(url.pathname);
  const target: StreamTarget | null = m ? openStream(m[1]!, SECRET) : null;
  if (!target) return send(res, 403, 'invalid or expired token');
  if (!(await upstreamAllowed(target.u))) return send(res, 403, 'upstream not allowed');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS);
  // Le client (TV) coupe : on coupe l'origine (zapping, fermeture du lecteur).
  res.on('close', () => ctrl.abort());

  const headers: Record<string, string> = { 'User-Agent': target.ua || DEFAULT_UA, Accept: '*/*' };
  if (target.ref) headers.Referer = target.ref;
  if (req.headers.range) headers.Range = String(req.headers.range);

  // Redirections suivies à la main : chaque saut est revérifié (SSRF).
  let up: Response | null = null;
  let current = target.u;
  try {
    for (let hop = 0; hop < 5; hop++) {
      if (hop > 0 && !(await upstreamAllowed(current))) {
        clearTimeout(timer);
        return send(res, 403, 'redirect not allowed');
      }
      const r = await fetch(current, { headers, signal: ctrl.signal, redirect: 'manual' });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
      if (!loc) {
        up = r;
        break;
      }
      r.body?.cancel().catch(() => {});
      current = new URL(loc, current).toString();
    }
  } catch (e) {
    clearTimeout(timer);
    if (ctrl.signal.aborted && res.destroyed) return;
    return send(res, 502, 'upstream unreachable: ' + (e as Error).message);
  }
  clearTimeout(timer);
  if (!up) return send(res, 502, 'too many redirects');
  const finalUrl = current;

  const contentType = up.headers.get('content-type') || '';
  if (up.ok && isPlaylist(finalUrl, contentType)) {
    const buf = Buffer.from(await up.arrayBuffer());
    if (buf.length > MAX_PLAYLIST_BYTES) return send(res, 502, 'playlist too large');
    const text = buf.toString('utf8');
    if (!text.trimStart().startsWith('#EXTM3U')) return send(res, 502, 'invalid playlist');
    // Derrière Caddy / Render, la requête arrive en http : on respecte X-Forwarded-Proto.
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0]!.trim();
    const base = PUBLIC_URL || proto + '://' + (req.headers.host || 'localhost:' + PORT);
    const exp = Math.floor(Date.now() / 1000) + CHILD_TTL_SEC;
    const body = rewriteHlsPlaylist(text, finalUrl, (u) =>
      proxiedUrl(base, { u, ua: target.ua, ref: target.ref, exp }, SECRET),
    );
    res.writeHead(200, {
      ...CORS,
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }

  // Média : relais tel quel (statut 200/206, plages, longueur).
  const out: Record<string, string> = { ...CORS, 'Cache-Control': 'no-cache' };
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const v = up.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(up.status, out);
  if (req.method === 'HEAD' || !up.body) {
    ctrl.abort();
    return res.end();
  }
  try {
    await pipeline(Readable.fromWeb(up.body as never), res);
  } catch {
    // Client parti ou origine coupée : rien à faire, les deux côtés sont fermés.
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error('[proxy]', e);
    send(res, 500, 'error');
  });
});
server.keepAliveTimeout = 65_000;
server.listen(PORT, () => console.log(`[stream-proxy] :${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    stopAllRemux();
    server.close(() => process.exit(0));
  });
}
