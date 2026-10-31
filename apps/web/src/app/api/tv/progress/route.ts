import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { tvContext } from '@/lib/tv-api';
import { isCompleted } from '@/lib/user-data';

const body = z.object({
  kind: z.enum(['live', 'vod', 'episode']),
  id: z.number().int().positive(),
  position: z.number().min(0).max(1e6),
  duration: z.number().min(0).max(1e6).nullable(),
});

const TABLE = { live: schema.channels, vod: schema.vodItems, episode: schema.episodes } as const;

/**
 * Position de lecture (envoyée toutes les 10 s par la TV et à la sortie du lecteur).
 * Pour le direct : simple trace « regardé récemment ».
 */
export async function PUT(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request');
  const { kind, id } = parsed.data;
  const position = Math.round(parsed.data.position);
  const duration = parsed.data.duration ? Math.round(parsed.data.duration) : null;

  const db = await getDb();
  const t = TABLE[kind];
  const exists = await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.playlistId, ctx.playlist.id))).limit(1);
  if (!exists.length) return apiError(404, 'not_found');

  const w = schema.watchProgress;
  const values = {
    userId: ctx.device.userId,
    kind,
    itemId: id,
    positionSec: kind === 'live' ? 0 : position,
    durationSec: duration,
    completed: kind !== 'live' && isCompleted(position, duration),
    updatedAt: new Date(),
  };
  await db
    .insert(w)
    .values(values)
    .onConflictDoUpdate({
      target: [w.userId, w.kind, w.itemId],
      set: { positionSec: values.positionSec, durationSec: values.durationSec, completed: values.completed, updatedAt: values.updatedAt },
    });
  return json({ ok: true as const });
}
