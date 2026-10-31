import { eq } from 'drizzle-orm';
import type { TvSettings } from '@iptv/shared';
import { getDb, schema } from './db';

type Row = typeof schema.userSettings.$inferSelect;

export function toTvSettings(r: Row | null | undefined): TvSettings {
  return {
    audioLang: r?.audioLang ?? null,
    subtitleLang: r?.subtitleLang ?? null,
    playerMode: r?.playerMode ?? 'auto',
    livePreview: r?.livePreview ?? true,
    hasPin: !!r?.parentalPinHash,
  };
}

/** Upsert partiel des réglages d'un utilisateur. */
export async function saveSettings(userId: string, patch: Partial<typeof schema.userSettings.$inferInsert>) {
  const db = await getDb();
  const s = schema.userSettings;
  const [row] = await db
    .insert(s)
    .values({ userId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.userId, set: { ...patch, updatedAt: new Date() } })
    .returning();
  return row!;
}

export async function getSettings(userId: string) {
  const db = await getDb();
  return (await db.query.userSettings.findFirst({ where: eq(schema.userSettings.userId, userId) })) ?? null;
}
