/**
 * Réception d'un fichier M3U. Le navigateur le compresse en gzip avant envoi
 * (CompressionStream) : un fichier de ~40 Mo tient sous la limite de 4,5 Mo
 * des requêtes Vercel. Stocké tel quel (gzip) en base : privé et compact.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { getDb, schema } from '@/lib/db';
import { ownedPlaylist } from '@/lib/playlists';
import { apiError, json } from '@/lib/http';
import { kickJob, startSync } from '@/lib/sync/runner';

const MAX_BODY = 4_400_000;
const MAX_RAW = 200_000_000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError(401, 'unauthorized');
  const { id } = await params;
  const p = await ownedPlaylist(session.user.id, id);
  if (!p || p.type !== 'm3u_file') return apiError(404, 'not_found');

  const body = Buffer.from(await req.arrayBuffer());
  if (!body.length) return apiError(400, 'empty', 'Fichier vide.');
  if (body.length > MAX_BODY) return apiError(413, 'too_large', 'Fichier trop volumineux (4 Mo compressé maximum).');

  let gz: Buffer;
  let size: number;
  if (req.headers.get('x-gzip') === '1') {
    if (body[0] !== 0x1f || body[1] !== 0x8b) return apiError(400, 'bad_gzip', 'Compression invalide.');
    try {
      size = gunzipSync(body, { maxOutputLength: MAX_RAW }).length;
    } catch {
      return apiError(400, 'bad_gzip', 'Fichier compressé illisible ou trop volumineux.');
    }
    gz = body;
  } else {
    size = body.length;
    gz = gzipSync(body);
  }

  const fileName = decodeURIComponent(req.headers.get('x-file-name') || '').slice(0, 120) || 'playlist.m3u';
  const db = await getDb();
  await db
    .insert(schema.playlistFiles)
    .values({ playlistId: p.id, gzData: gz, size })
    .onConflictDoUpdate({ target: schema.playlistFiles.playlistId, set: { gzData: gz, size, uploadedAt: new Date() } });
  await db
    .update(schema.playlists)
    .set({ sourceUrl: null, meta: { ...p.meta, fileName }, updatedAt: new Date() })
    .where(eq(schema.playlists.id, p.id));

  await kickJob(await startSync(p.id));
  return json({ ok: true, size });
}
