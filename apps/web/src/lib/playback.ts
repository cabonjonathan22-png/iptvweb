/**
 * Résolution d'une demande de lecture : URL d'origine (M3U ou Xtream) puis,
 * si nécessaire, URL du proxy de flux avec jeton chiffré.
 */
import { and, eq } from 'drizzle-orm';
import {
  xtreamEpisodeUrl,
  xtreamLiveUrl,
  xtreamVodUrl,
  type PlayKind,
  type PlayResponse,
  type StreamType,
  type XtreamCreds,
} from '@iptv/shared';
import { proxiedUrl } from '@iptv/shared/stream-token';
import { getDb, schema } from './db';
import { decryptJson } from './crypto';
import { categoryLocked } from './user-data';

type Playlist = typeof schema.playlists.$inferSelect;

/** Validité des jetons de lecture (un film long doit pouvoir aller au bout). */
const TOKEN_TTL_SEC = 12 * 3600;

export function streamTypeOf(url: string, live: boolean): StreamType {
  const path = url.split('?')[0]!.toLowerCase();
  if (/\.m3u8?$/.test(path)) return 'hls';
  if (/\.ts$/.test(path)) return 'ts';
  if (/\.mkv$/.test(path)) return 'mkv';
  if (/\.(mp4|m4v|mov|webm)$/.test(path)) return 'mp4';
  // Live sans extension (panels « http://host/user/pass/123 ») : presque toujours du MPEG-TS.
  return live ? 'ts' : 'mp4';
}

function proxyConfig() {
  const url = process.env.STREAM_PROXY_URL;
  const secret = process.env.STREAM_PROXY_SECRET;
  return url && secret ? { url, secret } : null;
}

/**
 * Réveille le proxy s'il dort (hébergement gratuit : veille après 15 min).
 * Appelé à l'ouverture de la TV pour que la première chaîne démarre plus vite.
 */
export async function wakeStreamProxy(): Promise<void> {
  const url = process.env.STREAM_PROXY_URL;
  if (!url) return;
  await fetch(url.replace(/\/$/, '') + '/health', { signal: AbortSignal.timeout(70_000) }).catch(() => undefined);
}

export type PlaybackError = 'not_found' | 'no_source' | 'locked';

export async function resolvePlayback(
  playlist: Playlist,
  kind: PlayKind,
  id: number,
  mode?: 'hls' | 'ts',
  /** false : refuse les contenus des catégories verrouillées (contrôle parental). */
  lockedOk = true,
): Promise<PlayResponse | PlaybackError> {
  const db = await getDb();
  const creds = playlist.type === 'xtream' && playlist.credentialsEnc ? decryptJson<XtreamCreds>(playlist.credentialsEnc) : null;
  let upstream: string | null = null;
  let ua: string | undefined;
  let ref: string | undefined;
  const live = kind === 'live';

  if (kind === 'live') {
    const c = await db.query.channels.findFirst({
      where: and(eq(schema.channels.id, id), eq(schema.channels.playlistId, playlist.id)),
    });
    if (!c) return 'not_found';
    if (!lockedOk && (await categoryLocked(c.categoryId))) return 'locked';
    upstream = creds ? xtreamLiveUrl(creds, c.externalId, mode === 'ts' ? 'ts' : 'm3u8') : c.streamUrl;
    ua = c.httpUserAgent ?? undefined;
    ref = c.httpReferrer ?? undefined;
  } else if (kind === 'vod') {
    const v = await db.query.vodItems.findFirst({
      where: and(eq(schema.vodItems.id, id), eq(schema.vodItems.playlistId, playlist.id)),
    });
    if (!v) return 'not_found';
    if (!lockedOk && (await categoryLocked(v.categoryId))) return 'locked';
    upstream = creds ? xtreamVodUrl(creds, v.externalId, v.containerExt || 'mp4') : v.streamUrl;
  } else {
    const e = await db.query.episodes.findFirst({
      where: and(eq(schema.episodes.id, id), eq(schema.episodes.playlistId, playlist.id)),
    });
    if (!e) return 'not_found';
    if (!lockedOk) {
      const s = await db.query.series.findFirst({ columns: { categoryId: true }, where: eq(schema.series.id, e.seriesId) });
      if (await categoryLocked(s?.categoryId ?? null)) return 'locked';
    }
    upstream = creds ? xtreamEpisodeUrl(creds, e.externalId, e.containerExt || 'mp4') : e.streamUrl;
  }
  if (!upstream) return 'no_source';

  const type = streamTypeOf(upstream, live);
  const proxy = proxyConfig();
  // Direct seulement si l'origine est déjà en HTTPS sans en-têtes spéciaux et sans identifiants à cacher.
  const direct = !proxy || (upstream.startsWith('https://') && !ua && !ref && !creds);
  if (direct) {
    return {
      url: upstream,
      type,
      live,
      proxied: false,
      ...(upstream.startsWith('http://') ? { warning: 'mixed_content' as const } : {}),
    };
  }
  return {
    url: proxiedUrl(proxy.url, { u: upstream, ua, ref, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC }, proxy.secret),
    type,
    live,
    proxied: true,
  };
}
