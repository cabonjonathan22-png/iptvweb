import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, signOut } from '@/auth';
import { Logo } from '@/components/Logo';
import { Disclaimer } from '@/components/Disclaimer';

/** Espace connecté. Les pages filles n'ont pas à revérifier la session pour l'affichage. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const tvUrl = (process.env.TV_APP_ORIGINS || '').split(',')[0]?.trim();

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/devices">
            <Logo />
          </Link>
          <nav className="-mx-2 flex flex-wrap items-center gap-1 text-sm sm:mx-0">
            <Link href="/playlists" className="rounded-lg px-3 py-2 text-fg hover:bg-surface-2">
              Playlists
            </Link>
            <Link href="/devices" className="rounded-lg px-3 py-2 text-fg hover:bg-surface-2">
              Appareils
            </Link>
            <Link href="/settings" className="rounded-lg px-3 py-2 text-fg hover:bg-surface-2">
              Réglages
            </Link>
            {tvUrl && (
              <a href={tvUrl} className="rounded-lg px-3 py-2 text-accent hover:bg-surface-2">
                Regarder
              </a>
            )}
            <form action={logout}>
              <button className="rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg">
                Déconnexion
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <Disclaimer />
    </>
  );
}
