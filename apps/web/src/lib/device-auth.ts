import { eq } from 'drizzle-orm';
import { getDb, schema } from './db';
import { sha256 } from './crypto';

export interface AuthedDevice {
  id: string;
  userId: string;
  name: string;
  playlistId: string | null;
}

/** On n'écrit last_seen qu'au plus toutes les 5 min pour limiter les écritures. */
const LAST_SEEN_THROTTLE_MS = 5 * 60_000;

/** Authentifie une requête TV via `Authorization: Bearer dvc_…`. */
export async function authenticateDevice(req: Request): Promise<AuthedDevice | null> {
  const header = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(dvc_[A-Za-z0-9_-]{20,})$/.exec(header);
  if (!m) return null;

  const db = await getDb();
  const row = await db.query.devices.findFirst({
    columns: { id: true, userId: true, name: true, playlistId: true, lastSeenAt: true },
    where: (d, { eq }) => eq(d.tokenHash, sha256(m[1]!)),
  });
  if (!row) return null;

  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db.update(schema.devices).set({ lastSeenAt: new Date() }).where(eq(schema.devices.id, row.id));
  }
  return { id: row.id, userId: row.userId, name: row.name, playlistId: row.playlistId };
}
