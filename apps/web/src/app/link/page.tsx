import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/auth';
import { Logo } from '@/components/Logo';
import { LinkForm } from '@/components/LinkForm';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = { title: 'Lier une TV' };

/** Cible du QR code affiché par la TV. Hors du groupe (app) pour conserver le code après connexion. */
export default async function LinkPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const clean = code?.replace(/[^A-Za-z0-9]/g, '').slice(0, 6);
  if (!(await currentUser())) {
    redirect('/login?callbackUrl=' + encodeURIComponent('/link' + (clean ? '?code=' + clean : '')));
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link href="/devices" className="mb-8">
          <Logo />
        </Link>
        <div className="card">
          <h1 className="text-xl font-semibold">Lier une TV</h1>
          <p className="mt-1 mb-6 text-sm text-muted">
            Ouvrez l&apos;app sur votre TV : un code à 6 caractères s&apos;affiche à l&apos;écran.
          </p>
          <LinkForm defaultCode={clean} />
        </div>
      </main>
      <Disclaimer />
    </>
  );
}
