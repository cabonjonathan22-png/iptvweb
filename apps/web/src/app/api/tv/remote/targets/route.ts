import { and, eq, ne } from 'drizzle-orm';
import type { RemoteTarget } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { json } from '@/lib/http';
import { getKv } from '@/lib/kv';
import { deviceOnly } from '@/lib/tv-api';

/** Autres appareils du compte actuellement allumés sur Oria (TV, PC). */
export async function GET(req: Request) {
  const device = await deviceOnly(req);
  if (device instanceof Response) return device;
  const db = await getDb();
  const d = schema.devices;
  const rows = await db
    .select({ id: d.id, name: d.name })
    .from(d)
    .where(and(eq(d.userId, device.userId), ne(d.id, device.id)));
  const kv = await getKv();
  const online = await Promise.all(rows.map((r) => kv.get('remote:on:' + r.id)));
  const out: RemoteTarget[] = rows.filter((_, i) => online[i]);
  return json(out, { headers: { 'Cache-Control': 'no-store' } });
}
