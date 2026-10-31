import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { deviceOnly } from '@/lib/tv-api';

/** Changement de playlist active depuis la TV. */
export async function PUT(req: Request) {
  const device = await deviceOnly(req);
  if (device instanceof Response) return device;
  const parsed = z.object({ playlistId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request');
  const db = await getDb();
  const owned = await db.query.playlists.findFirst({
    columns: { id: true },
    where: and(eq(schema.playlists.id, parsed.data.playlistId), eq(schema.playlists.userId, device.userId)),
  });
  if (!owned) return apiError(404, 'not_found');
  await db.update(schema.devices).set({ playlistId: owned.id }).where(eq(schema.devices.id, device.id));
  return json({ ok: true as const });
}
