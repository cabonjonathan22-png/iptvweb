import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND } from '@iptv/shared';
import { currentUser } from '@/auth';
import { Logo } from '@/components/Logo';
import { Disclaimer } from '@/components/Disclaimer';

export default async function Home() {
  if (await currentUser()) redirect('/devices');

  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <Link href="/login" className="btn-ghost">
          Se connecter
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
          {BRAND.tagline}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted text-pretty">
          Ouvrez l&apos;app sur le navigateur de votre Smart TV, saisissez le code affiché ici, et
          retrouvez vos playlists M3U, Xtream et votre guide TV, pilotables à la télécommande.
        </p>
        <ol className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'Créez un compte', 'Email ou Google, en 10 secondes.'],
            ['2', 'Liez votre TV', 'Un code à 6 caractères ou un QR code.'],
            ['3', 'Ajoutez vos sources', 'M3U, Xtream Codes, EPG XMLTV.'],
          ].map(([n, t, d]) => (
            <li key={n} className="card">
              <span className="text-sm font-semibold text-accent">{n}</span>
              <p className="mt-1 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <Link href="/login" className="btn-primary">
            Commencer
          </Link>
        </div>
      </main>
      <Disclaimer />
    </>
  );
}
