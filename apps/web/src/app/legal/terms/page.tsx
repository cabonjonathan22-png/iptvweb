import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@iptv/shared';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = { title: "Conditions d'utilisation" };

/** CGU provisoires : à faire relire par un juriste avant mise en production. */
export default function TermsPage() {
  const n = BRAND.name;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/">
        <Logo />
      </Link>
      <article className="mt-10 space-y-6 leading-relaxed text-muted [&_h1]:text-fg [&_h2]:text-fg">
        <h1 className="text-3xl font-bold tracking-tight">Conditions d&apos;utilisation</h1>
        <section>
          <h2 className="mb-2 text-lg font-semibold">1. Objet du service</h2>
          <p>
            {n} est un logiciel de lecture multimédia. Il permet de lire des listes de lecture (M3U,
            Xtream Codes) et des guides de programmes (XMLTV) que l&apos;utilisateur ajoute lui-même.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">2. Absence de contenu</h2>
          <p>
            {n} ne fournit, n&apos;héberge, ne vend et ne promeut aucun contenu audiovisuel, chaîne,
            abonnement ou playlist. Aucune source n&apos;est préinstallée ni suggérée.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">3. Responsabilité de l&apos;utilisateur</h2>
          <p>
            L&apos;utilisateur est seul responsable des sources qu&apos;il ajoute. Il garantit disposer des
            droits nécessaires pour y accéder et s&apos;engage à respecter la législation applicable,
            notamment en matière de propriété intellectuelle. Tout usage visant à accéder à des contenus
            sans l&apos;autorisation de leurs ayants droit est interdit et peut entraîner la suppression du
            compte.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">4. Données</h2>
          <p>
            Les identifiants de vos sources sont chiffrés sur nos serveurs. Les données de visionnage
            (favoris, reprise de lecture) servent uniquement au fonctionnement du service. Vous pouvez
            supprimer votre compte et vos données à tout moment.
          </p>
        </section>
      </article>
    </main>
  );
}
