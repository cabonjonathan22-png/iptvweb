/**
 * Accès aux sources fournies par l'utilisateur (M3U, API Xtream, EPG).
 *
 * Protection SSRF : une URL saisie par un utilisateur ne doit pas permettre
 * d'atteindre le réseau interne de l'hébergeur (métadonnées cloud, services
 * privés). On refuse les schémas autres que http(s) et toute IP privée,
 * réservée ou de bouclage, y compris après résolution DNS et à chaque redirection.
 * En dev, ALLOW_PRIVATE_SOURCES=1 autorise un serveur IPTV sur le réseau local.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';

export class SourceError extends Error {
  constructor(
    message: string,
    public code: 'blocked' | 'unreachable' | 'http' | 'timeout' | 'invalid' | 'auth',
  ) {
    super(message);
  }
}

/** User-agent proche d'un lecteur courant : beaucoup de panels filtrent les UA inconnus. */
export const SOURCE_UA = 'VLC/3.0.21 LibVLC/3.0.21';

function v4Private(ip: string): boolean {
  const p = ip.split('.').map(Number) as [number, number, number, number];
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return v4Private(ip);
  const l = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
  if (mapped) return v4Private(mapped[1]!);
  return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

const allowPrivate = () => process.env.ALLOW_PRIVATE_SOURCES === '1' && !process.env.VERCEL;

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SourceError('URL invalide.', 'invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SourceError('Seules les URL http:// et https:// sont acceptées.', 'invalid');
  }
  if (allowPrivate()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new SourceError('Adresse locale non autorisée.', 'blocked');
  }
  const ips = net.isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!ips.length) throw new SourceError(`Serveur introuvable : ${host}`, 'unreachable');
  if (ips.some(isPrivateIp)) throw new SourceError('Adresse réseau privée non autorisée.', 'blocked');
  return url;
}

export interface FetchSourceOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** fetch() avec vérification SSRF à chaque saut de redirection et timeout de connexion. */
export async function fetchSource(raw: string, opts: FetchSourceOptions = {}): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = await assertPublicUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': SOURCE_UA, Accept: '*/*', ...opts.headers },
      });
    } catch (e) {
      throw ctrl.signal.aborted
        ? new SourceError('Le serveur ne répond pas (délai dépassé).', 'timeout')
        : new SourceError(`Connexion impossible : ${(e as Error).message}`, 'unreachable');
    } finally {
      // Le timeout ne couvre que l'établissement de la réponse, pas la lecture du corps.
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, url).toString();
      continue;
    }
    if (!res.ok) {
      throw new SourceError(
        res.status === 401 || res.status === 403
          ? `Accès refusé par le serveur (HTTP ${res.status}). Vérifiez vos identifiants ou votre abonnement.`
          : `Le serveur a répondu HTTP ${res.status}.`,
        res.status === 401 || res.status === 403 ? 'auth' : 'http',
      );
    }
    return res;
  }
  throw new SourceError('Trop de redirections.', 'http');
}

export async function fetchJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const res = await fetchSource(url, { timeoutMs, headers: { Accept: 'application/json' } });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError('Réponse invalide du serveur (JSON attendu).', 'invalid');
  }
}

/** Corps de réponse (décompressé si .gz) -> morceaux de texte UTF-8. */
export async function* responseText(res: Response, url: string): AsyncGenerator<string> {
  if (!res.body) return;
  const gz = /\.gz(\?|$)/i.test(url) && !/gzip/i.test(res.headers.get('content-encoding') || '');
  const stream = gz
    ? Readable.fromWeb(res.body as never).pipe(createGunzip())
    : (res.body as unknown as AsyncIterable<Uint8Array>);
  yield* decodeChunks(stream);
}

/** Données gzip stockées en base -> morceaux de texte. */
export async function* gzipText(data: Buffer): AsyncGenerator<string> {
  yield* decodeChunks(Readable.from([data]).pipe(createGunzip()));
}

async function* decodeChunks(src: AsyncIterable<Uint8Array | Buffer>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  for await (const chunk of src) {
    const s = decoder.decode(chunk as Uint8Array, { stream: true });
    if (s) yield s;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}
