import { after } from 'next/server';
import type { TvMeResponse } from '@iptv/shared';
import { authenticateDevice } from '@/lib/device-auth';
import { getDb } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { wakeStreamProxy } from '@/lib/playback';

export async function GET(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return apiError(401, 'unauthorized');
  after(wakeStreamProxy);

  const db = await getDb();
  const [user, playlist] = await Promise.all([
    db.query.users.findFirst({ columns: { email: true }, where: (u, { eq }) => eq(u.id, device.userId) }),
    device.playlistId
      ? db.query.playlists.findFirst({
          columns: { id: true, name: true, status: true },
          where: (p, { eq }) => eq(p.id, device.playlistId!),
        })
      : Promise.resolve(undefined),
  ]);

  const body: TvMeResponse = {
    device: { id: device.id, name: device.name, playlistId: device.playlistId },
    account: { email: user?.email ?? null },
    playlist: playlist ?? null,
  };
  return json(body, { headers: { 'Cache-Control': 'no-store' } });
}
