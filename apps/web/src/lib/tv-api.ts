/**
 * Socle des endpoints TV : authentification par device token, playlist
 * assignée, contrôle parental et cache HTTP par ETag (la TV revalide, le
 * serveur répond 304 sans recalculer ni renvoyer la liste quand rien n'a changé).
 */
import { createHash } from 'node:crypto';
import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { authenticateDevice, type AuthedDevice } from './device-auth';
import { getDb, schema } from './db';
import { apiError } from './http';
import { isUnlocked } from './parental';

export type Playlist = typeof schema.playlists.$inferSelect;
export type UserSettings = typeof schema.userSettings.$inferSelect;

export interface TvContext {
  device: AuthedDevice;
  playlist: Playlist;
  settings: UserSettings | null;
  /** Contenus des catégories verrouillées accessibles (pas de PIN, ou PIN saisi). */
  lockedOk: boolean;
  /** Origine de la requête, pour construire des URL absolues (images). */
  origin: string;
}

export async function deviceOnly(req: Request) {
  const device = await authenticateDevice(req);
  return device ?? apiError(401, 'unauthorized');
}

export async function tvContext(req: Request): Promise<TvContext | NextResponse> {
  const device = await authenticateDevice(req);
  if (!device) return apiError(401, 'unauthorized');
  if (!device.playlistId) return apiError(409, 'no_playlist', 'Aucune playlist assignée à cette TV.');
  const db = await getDb();
  const [playlist, settings] = await Promise.all([
    db.query.playlists.findFirst({ where: eq(schema.playlists.id, device.playlistId) }),
    db.query.userSettings.findFirst({ where: eq(schema.userSettings.userId, device.userId) }),
  ]);
  if (!playlist) return apiError(409, 'no_playlist', 'Aucune playlist assignée à cette TV.');
  const lockedOk = !settings?.parentalPinHash || isUnlocked(req, device.userId);
  return { device, playlist, settings: settings ?? null, lockedOk, origin: publicOrigin(req) };
}

/** Origine publique (derrière le proxy Vercel, l'URL interne peut différer). */
export function publicOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  return host ? proto + '://' + host : new URL(req.url).origin;
}

/**
 * Contenu visible : catégorie non masquée, et non verrouillée sauf déverrouillage.
 * Les contenus sans catégorie restent visibles. À utiliser avec un LEFT JOIN sur categories.
 */
export function visibleCategory(categoryId: SQL.Aliased | Parameters<typeof isNull>[0], lockedOk: boolean): SQL {
  const c = schema.categories;
  return or(isNull(categoryId), and(eq(c.hidden, false), lockedOk ? undefined : eq(c.locked, false)))!;
}

export const lockedError = () => apiError(403, 'locked', 'Contenu protégé par le code parental.');

/**
 * Réponse JSON avec ETag dérivé de l'état de la playlist (génération de synchro
 * + dernière modification), du déverrouillage parental et de la requête :
 * 304 si le client est à jour.
 */
export async function cachedJson<T>(req: Request, ctx: TvContext, produce: () => Promise<T>): Promise<NextResponse> {
  const p = ctx.playlist;
  const url = new URL(req.url);
  const tag =
    'W/"' +
    createHash('sha1')
      .update([p.id, p.syncGen, p.updatedAt.getTime(), ctx.lockedOk, url.pathname, url.search].join('|'))
      .digest('base64url')
      .slice(0, 20) +
    '"';
  const headers = { ETag: tag, 'Cache-Control': 'private, no-cache' };
  if (req.headers.get('if-none-match') === tag) return new NextResponse(null, { status: 304, headers });
  return NextResponse.json(await produce(), { headers });
}
