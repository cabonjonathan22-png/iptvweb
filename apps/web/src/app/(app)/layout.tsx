import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, signOut } from '@/auth';
import { Logo } from '@/components/Logo';
import { Disclaimer } from '@/components/Disclaimer';

/** Espace connecté. Les pages filles n'ont pas à revérifier la session pour l'affichage. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/devices">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/playlists" className="rounded-lg px-3 py-2 text-fg hover:bg-surface-2">
              Playlists
            </Link>
            <Link href="/devices" className="rounded-lg px-3 py-2 text-fg hover:bg-surface-2">
              Appareils
            </Link>
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
