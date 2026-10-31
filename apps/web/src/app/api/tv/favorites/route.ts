import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { tvContext } from '@/lib/tv-api';

const body = z.object({ kind: z.enum(['live', 'vod', 'series']), id: z.number().int().positive(), on: z.boolean() });
const TABLE = { live: schema.channels, vod: schema.vodItems, series: schema.series } as const;

/** Ajout / retrait d'un favori (touche rouge sur la TV). */
export async function POST(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request');
  const { kind, id, on } = parsed.data;
  const db = await getDb();
  const t = TABLE[kind];
  const exists = await db.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.playlistId, ctx.playlist.id))).limit(1);
  if (!exists.length) return apiError(404, 'not_found');
  const f = schema.favorites;
  if (on) {
    await db.insert(f).values({ userId: ctx.device.userId, kind, itemId: id }).onConflictDoNothing();
  } else {
    await db.delete(f).where(and(eq(f.userId, ctx.device.userId), eq(f.kind, kind), eq(f.itemId, id)));
  }
  return json({ ok: true as const });
}
