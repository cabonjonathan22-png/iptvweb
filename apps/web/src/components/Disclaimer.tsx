import Link from 'next/link';
import { BRAND } from '@iptv/shared';

export function Disclaimer() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-xs leading-relaxed text-muted sm:px-6">
      <p>
        {BRAND.name} est un lecteur. Il ne fournit, n&apos;héberge et ne vend aucun contenu, chaîne ou
        abonnement. Vous êtes seul responsable des sources que vous ajoutez et devez disposer des droits
        nécessaires pour y accéder.{' '}
        <Link href="/legal/terms" className="underline hover:text-fg">
          Conditions d&apos;utilisation
        </Link>
      </p>
    </footer>
  );
}
