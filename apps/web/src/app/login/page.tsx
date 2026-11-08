import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { currentUser, googleEnabled, signIn } from '@/auth';
import { Logo } from '@/components/Logo';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = { title: 'Connexion' };

/** N'accepte que des chemins internes pour éviter les redirections ouvertes. */
function safeCallback(v: string | undefined): string {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/devices';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = safeCallback(sp.callbackUrl);
  if (await currentUser()) redirect(callbackUrl);

  async function emailSignIn(formData: FormData) {
    'use server';
    try {
      await signIn('resend', { email: String(formData.get('email') || ''), redirectTo: callbackUrl });
    } catch (e) {
      // La redirection de Next passe aussi par une exception : on la laisse remonter.
      if (!(e instanceof AuthError)) throw e;
      redirect('/login?error=email&callbackUrl=' + encodeURIComponent(callbackUrl));
    }
  }
  async function googleSignIn() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-8">
          <Logo />
        </div>
        {sp.sent ? (
          <div className="card">
            <h1 className="text-xl font-semibold">Vérifiez votre boîte mail</h1>
            <p className="mt-2 text-sm text-muted">
              Un lien de connexion vient de vous être envoyé. Il est valable 24 heures.
            </p>
          </div>
        ) : (
          <div className="card">
            <h1 className="text-xl font-semibold">Connexion</h1>
            <p className="mt-1 text-sm text-muted">Pas de mot de passe : on vous envoie un lien.</p>
            {sp.error && (
              <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {sp.error === 'email' || sp.error === 'Configuration'
                  ? googleEnabled
                    ? "L'e-mail de connexion n'a pas pu être envoyé à cette adresse. Utilisez « Continuer avec Google »."
                    : "L'e-mail de connexion n'a pas pu être envoyé à cette adresse. Demandez à l'administrateur d'Oria d'activer la connexion pour elle."
                  : 'La connexion a échoué. Réessayez.'}
              </p>
            )}
            <form action={emailSignIn} className="mt-6">
              <label htmlFor="email" className="label">
                Adresse email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="vous@exemple.com"
                className="input"
              />
              <button type="submit" className="btn-primary mt-4 w-full">
                Recevoir le lien
              </button>
            </form>
            {googleEnabled && (
              <>
                <div className="my-5 flex items-center gap-3 text-xs text-muted">
                  <span className="h-px flex-1 bg-line" />
                  ou
                  <span className="h-px flex-1 bg-line" />
                </div>
                <form action={googleSignIn}>
                  <button type="submit" className="btn-ghost w-full">
                    Continuer avec Google
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </main>
      <Disclaimer />
    </>
  );
}
