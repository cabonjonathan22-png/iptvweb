/**
 * Socle des endpoints TV : authentification par device token, playlist
 * assignée, et cache HTTP par ETag (la TV revalide, le serveur répond 304
 * sans recalculer ni renvoyer la liste quand rien n'a changé).
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { authenticateDevice, type AuthedDevice } from './device-auth';
import { getDb, schema } from './db';
import { apiError } from './http';

export type Playlist = typeof schema.playlists.$inferSelect;

export interface TvContext {
  device: AuthedDevice;
  playlist: Playlist;
  /** Origine de la requête, pour construire des URL absolues (images). */
  origin: string;
}

export async function tvContext(req: Request): Promise<TvContext | NextResponse> {
  const device = await authenticateDevice(req);
  if (!device) return apiError(401, 'unauthorized');
  if (!device.playlistId) return apiError(409, 'no_playlist', 'Aucune playlist assignée à cette TV.');
  const db = await getDb();
  const playlist = await db.query.playlists.findFirst({ where: eq(schema.playlists.id, device.playlistId) });
  if (!playlist) return apiError(409, 'no_playlist', 'Aucune playlist assignée à cette TV.');
  return { device, playlist, origin: publicOrigin(req) };
}

/** Origine publique (derrière le proxy Vercel, l'URL interne peut différer). */
export function publicOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  return host ? proto + '://' + host : new URL(req.url).origin;
}

/**
 * Réponse JSON avec ETag dérivé de l'état de la playlist (génération de synchro
 * + dernière modification) et de la requête : 304 si le client est à jour.
 */
export async function cachedJson<T>(req: Request, p: Playlist, produce: () => Promise<T>): Promise<NextResponse> {
  const url = new URL(req.url);
  const tag =
    'W/"' +
    createHash('sha1')
      .update([p.id, p.syncGen, p.updatedAt.getTime(), url.pathname, url.search].join('|'))
      .digest('base64url')
      .slice(0, 20) +
    '"';
  const headers = { ETag: tag, 'Cache-Control': 'private, no-cache' };
  if (req.headers.get('if-none-match') === tag) return new NextResponse(null, { status: 304, headers });
  return NextResponse.json(await produce(), { headers });
}
