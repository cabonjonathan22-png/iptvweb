import { auth } from '@/auth';
import { apiError, json } from '@/lib/http';
import { ownedPlaylist } from '@/lib/playlists';
import { resolvePlayback } from '@/lib/playback';

/** Lecteur de test du dashboard : même résolution que la TV, authentifiée par session. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError(401, 'unauthorized');
  const sp = new URL(req.url).searchParams;
  const p = await ownedPlaylist(session.user.id, sp.get('playlist') || '');
  const kind = sp.get('kind');
  const id = Number(sp.get('id'));
  if (!p || (kind !== 'live' && kind !== 'vod' && kind !== 'episode') || !Number.isInteger(id)) {
    return apiError(400, 'bad_request');
  }
  const res = await resolvePlayback(p, kind, id);
  if (typeof res === 'string') return apiError(404, res);
  return json(res, { headers: { 'Cache-Control': 'no-store' } });
}
