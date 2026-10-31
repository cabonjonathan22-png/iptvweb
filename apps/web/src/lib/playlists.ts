import { and, eq } from 'drizzle-orm';
import { getDb, schema } from './db';

export const MAX_PLAYLISTS_PER_USER = 20;

/** Playlist appartenant à l'utilisateur, ou null. */
export async function ownedPlaylist(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  return (
    (await db.query.playlists.findFirst({
      where: and(eq(schema.playlists.id, id), eq(schema.playlists.userId, userId)),
    })) ?? null
  );
}

export const TYPE_LABELS = {
  m3u_url: 'M3U (URL)',
  m3u_file: 'M3U (fichier)',
  xtream: 'Xtream Codes',
} as const;
