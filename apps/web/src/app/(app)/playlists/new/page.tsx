import type { Metadata } from 'next';
import Link from 'next/link';
import { NewPlaylistForm } from '@/components/NewPlaylistForm';

export const metadata: Metadata = { title: 'Ajouter une playlist' };

export default function NewPlaylistPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/playlists" className="text-sm text-muted hover:text-fg">
          ← Playlists
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Ajouter une playlist</h1>
        <p className="mt-1 text-sm text-muted">
          Utilisez uniquement des sources auxquelles vous avez légalement accès. Les identifiants Xtream sont chiffrés et
          ne sont jamais renvoyés à votre navigateur.
        </p>
      </div>
      <div className="card">
        <NewPlaylistForm />
      </div>
    </div>
  );
}
