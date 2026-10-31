/**
 * Route réservée aux tests e2e : crée un utilisateur + une session et pose le
 * cookie Auth.js. Inexistante (404) hors E2E_TEST_MODE=1, et jamais sur Vercel.
 */
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';

export async function POST(req: Request) {
  if (process.env.E2E_TEST_MODE !== '1' || process.env.VERCEL) return apiError(404, 'not_found');

  const { email } = (await req.json()) as { email: string };
  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, email) });
  const user =
    existing ?? (await db.insert(schema.users).values({ email, emailVerified: new Date() }).returning())[0]!;

  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 86400_000);
  await db.insert(schema.sessions).values({ sessionToken, userId: user.id, expires });
  (await cookies()).set('authjs.session-token', sessionToken, { path: '/', httpOnly: true, expires });
  return json({ userId: user.id });
}
