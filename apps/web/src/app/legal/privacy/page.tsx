import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@iptv/shared';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = { title: 'Confidentialité' };

/** Provisoire : à faire relire par un juriste, comme les CGU. */
export default function PrivacyPage() {
  const n = BRAND.name;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/">
        <Logo />
      </Link>
      <article className="mt-10 space-y-6 leading-relaxed text-muted [&_h1]:text-fg [&_h2]:text-fg">
        <h1 className="text-3xl font-bold tracking-tight">Règles de confidentialité</h1>
        <section>
          <h2 className="mb-2 text-lg font-semibold">1. Données utilisées</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Compte : adresse e-mail et, avec la connexion Google, nom et photo de profil.</li>
            <li>Sources ajoutées : adresses de playlists et identifiants, chiffrés sur nos serveurs.</li>
            <li>Appareils liés : nom, type de navigateur, date de dernière connexion.</li>
            <li>Utilisation : favoris, positions de lecture, chaînes récentes, réglages.</li>
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">2. Utilisation</h2>
          <p>
            Ces données servent uniquement à faire fonctionner {n} : vous connecter, synchroniser vos
            playlists, reprendre une lecture d&apos;un appareil à l&apos;autre. Elles ne sont ni vendues, ni
            partagées à des fins publicitaires. {n} ne contient pas de publicité.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">3. Connexion avec Google</h2>
          <p>
            {n} ne demande à Google que votre adresse e-mail, votre nom et votre photo de profil, pour
            vous identifier. Aucun autre accès à votre compte Google n&apos;est demandé.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">4. Prestataires</h2>
          <p>
            Le service repose sur Vercel (hébergement), Neon (base de données), Render (relais des flux
            vidéo) et Resend (e-mails de connexion), qui traitent ces données pour notre compte.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">5. Vos droits</h2>
          <p>
            Vous pouvez demander l&apos;accès à vos données, leur correction ou leur suppression en écrivant
            à l&apos;adresse d&apos;assistance indiquée sur l&apos;écran de connexion Google.
          </p>
        </section>
      </article>
    </main>
  );
}
