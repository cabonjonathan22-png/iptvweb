import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RemoteCommand } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { getKv } from '@/lib/kv';
import { deviceOnly } from '@/lib/tv-api';

/** Une commande non récupérée (TV éteinte entre-temps) ne doit pas s'exécuter bien plus tard. */
const QUEUE_TTL_SEC = 60;
/** Un appareil est « allumé » s'il a interrogé la file récemment. */
const ONLINE_TTL_SEC = 15;
const MAX_QUEUE = 20;

const queueKey = (id: string) => 'remote:q:' + id;
export const onlineKey = (id: string) => 'remote:on:' + id;

const channel = z.object({
  id: z.number().int(),
  num: z.number().int().nullable(),
  name: z.string().max(300),
  logo: z.string().max(4000).nullable(),
  epgId: z.string().max(300).nullable(),
  catchup: z.boolean(),
});
const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('wake') }),
  z.object({ type: z.literal('key'), key: z.enum(['up', 'down', 'left', 'right', 'ok', 'back', 'playPause', 'chUp', 'chDown']) }),
  z.object({ type: z.literal('live'), channel }),
  z.object({ type: z.literal('vod'), id: z.number().int(), startAt: z.number().min(0) }),
  z.object({ type: z.literal('episode'), id: z.number().int(), seriesId: z.number().int(), startAt: z.number().min(0) }),
]);
const body = z.object({ deviceId: z.uuid(), command });

/** La TV récupère les commandes qui lui sont destinées, et signale ainsi qu'elle est allumée. */
export async function GET(req: Request) {
  const device = await deviceOnly(req);
  if (device instanceof Response) return device;
  const kv = await getKv();
  const key = queueKey(device.id);
  const [commands] = await Promise.all([kv.get<RemoteCommand[]>(key), kv.set(onlineKey(device.id), 1, { ex: ONLINE_TTL_SEC })]);
  if (commands && commands.length) await kv.del(key);
  return json({ commands: commands || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Le téléphone envoie une commande à un autre appareil du même compte. */
export async function POST(req: Request) {
  const device = await deviceOnly(req);
  if (device instanceof Response) return device;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request');
  const { deviceId, command: cmd } = parsed.data;

  const db = await getDb();
  const target = await db.query.devices.findFirst({
    columns: { id: true, playlistId: true },
    where: and(eq(schema.devices.id, deviceId), eq(schema.devices.userId, device.userId)),
  });
  if (!target) return apiError(404, 'not_found', 'Appareil introuvable.');
  // Les identifiants de contenu n'ont de sens que dans une même playlist.
  if (cmd.type !== 'wake' && cmd.type !== 'key' && target.playlistId !== device.playlistId) {
    return apiError(409, 'other_playlist', "Cet appareil utilise une autre playlist.");
  }

  const kv = await getKv();
  const key = queueKey(deviceId);
  const queue = (await kv.get<RemoteCommand[]>(key)) || [];
  await kv.set(key, queue.concat([cmd as RemoteCommand]).slice(-MAX_QUEUE), { ex: QUEUE_TTL_SEC });
  return json({ ok: true as const });
}
