/**
 * Auth.js v5 : magic link par email (Resend) + Google.
 * Sans clé Resend en dev, le lien de connexion est affiché dans la console du serveur.
 */
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { redirect } from 'next/navigation';
import { BRAND } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';

// RESEND_API_KEY : variable injectée par l'intégration Resend de Vercel.
const resendKey = process.env.AUTH_RESEND_KEY || process.env.RESEND_API_KEY;
const devMailer = !resendKey;

export const { handlers, auth, signIn, signOut } = NextAuth(async (): Promise<NextAuthConfig> => {
  const db = await getDb();
  const providers: NextAuthConfig['providers'] = [
    Resend({
      from: process.env.AUTH_EMAIL_FROM || `${BRAND.name} <onboarding@resend.dev>`,
      // Clé factice en dev : sendVerificationRequest est remplacé juste en dessous.
      apiKey: resendKey || 'dev',
      ...(devMailer && {
        async sendVerificationRequest({ identifier, url }) {
          console.log(`\n[auth] Lien de connexion pour ${identifier} :\n${url}\n`);
        },
      }),
    }),
  ];
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    // Google vérifie l'adresse : un compte créé par lien e-mail retrouve ses données.
    providers.push(Google({ allowDangerousEmailAccountLinking: true }));
  }

  return {
    adapter: DrizzleAdapter(db as unknown as PostgresJsDatabase, {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    providers,
    session: { strategy: 'database' },
    // Les erreurs reviennent sur /login (message lisible) au lieu de la page générique d'Auth.js.
    pages: { signIn: '/login', verifyRequest: '/login?sent=1', error: '/login' },
    trustHost: true,
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
  };
});

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/** Utilisateur courant ou null (server components / actions). */
export async function currentUser() {
  const session = await auth();
  return session?.user?.id ? { id: session.user.id, email: session.user.email ?? null } : null;
}

/**
 * Utilisateur courant, sinon redirection vers /login. À utiliser dans chaque page
 * protégée : Next rend layout et page en parallèle, le redirect du layout ne
 * suffit pas à empêcher l'exécution de la page.
 */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
