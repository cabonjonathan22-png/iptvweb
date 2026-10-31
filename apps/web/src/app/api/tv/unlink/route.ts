import { eq } from 'drizzle-orm';
import { authenticateDevice } from '@/lib/device-auth';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';

/** La TV se délie elle-même (Réglages > Délier la TV). */
export async function POST(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return apiError(401, 'unauthorized');
  const db = await getDb();
  await db.delete(schema.devices).where(eq(schema.devices.id, device.id));
  return json({ ok: true as const });
}
