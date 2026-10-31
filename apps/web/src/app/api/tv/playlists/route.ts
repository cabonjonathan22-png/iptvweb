import type { PlaylistSummary } from '@iptv/shared';
import { getDb } from '@/lib/db';
import { json } from '@/lib/http';
import { deviceOnly } from '@/lib/tv-api';

/** Playlists du compte, pour choisir la playlist active depuis la TV. */
export async function GET(req: Request) {
  const device = await deviceOnly(req);
  if (device instanceof Response) return device;
  const db = await getDb();
  const rows = await db.query.playlists.findMany({
    columns: { id: true, name: true, status: true },
    where: (p, { eq }) => eq(p.userId, device.userId),
    orderBy: (p, { asc }) => asc(p.createdAt),
  });
  return json<PlaylistSummary[]>(rows.map((r) => ({ ...r, active: r.id === device.playlistId })), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
