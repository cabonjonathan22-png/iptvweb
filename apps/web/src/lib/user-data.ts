import { and, eq, inArray } from 'drizzle-orm';
import type { Progress } from '@iptv/shared';
import { getDb, schema } from './db';

type ProgressKind = 'live' | 'vod' | 'episode';

/**
 * Considéré comme « vu » au-delà de 92 % (générique de fin), ou à moins de
 * 2 min de la fin pour un contenu de plus de 20 min.
 */
export function isCompleted(position: number, duration: number | null): boolean {
  if (!duration || duration <= 0) return false;
  return position / duration >= 0.92 || (duration > 1200 && duration - position < 120);
}

export async function progressFor(userId: string, kind: ProgressKind, ids: number[]): Promise<Map<number, Progress>> {
  const out = new Map<number, Progress>();
  if (!ids.length) return out;
  const db = await getDb();
  const w = schema.watchProgress;
  const rows = await db
    .select()
    .from(w)
    .where(and(eq(w.userId, userId), eq(w.kind, kind), inArray(w.itemId, ids)));
  for (const r of rows) out.set(r.itemId, { position: r.positionSec, duration: r.durationSec, completed: r.completed });
  return out;
}

export async function isFavorite(userId: string, kind: 'live' | 'vod' | 'series', itemId: number): Promise<boolean> {
  const db = await getDb();
  const f = schema.favorites;
  const r = await db.query.favorites.findFirst({ where: and(eq(f.userId, userId), eq(f.kind, kind), eq(f.itemId, itemId)) });
  return !!r;
}

/** La catégorie de l'élément est-elle verrouillée ? */
export async function categoryLocked(categoryId: number | null): Promise<boolean> {
  if (!categoryId) return false;
  const db = await getDb();
  const c = await db.query.categories.findFirst({
    columns: { locked: true, hidden: true },
    where: eq(schema.categories.id, categoryId),
  });
  return !!c && c.locked;
}
