import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/auth';
import { getDb } from '@/lib/db';
import { TYPE_LABELS } from '@/lib/playlists';
import { StatusBadge } from '@/components/StatusBadge';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ConfirmButton } from '@/components/ConfirmButton';
import { deletePlaylist, syncPlaylist } from '@/app/actions/playlists';

export const metadata: Metadata = { title: 'Playlists' };

const nf = new Intl.NumberFormat('fr-FR');
const df = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export default async function PlaylistsPage() {
  const user = await requireUser();
  const db = await getDb();
  const list = await db.query.playlists.findMany({
    columns: { credentialsEnc: false },
    where: (p, { eq }) => eq(p.userId, user.id),
    orderBy: (p, { asc }) => asc(p.createdAt),
  });

  return (
    <div className="space-y-8">
      <AutoRefresh active={list.some((p) => p.status === 'syncing')} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Playlists</h1>
          <p className="mt-1 text-muted">Vos sources, synchronisées automatiquement chaque jour.</p>
        </div>
        <Link href="/playlists/new" className="btn-primary">
          Ajouter une playlist
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="font-semibold">Aucune playlist</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Ajoutez un compte Xtream Codes, un lien M3U ou un fichier. Elle apparaîtra sur vos TV dès la fin de la
            synchronisation.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((p) => (
            <li key={p.id} className="card flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/playlists/${p.id}`} className="block truncate text-lg font-semibold hover:text-accent-strong">
                    {p.name}
                  </Link>
                  <p className="text-sm text-muted">{TYPE_LABELS[p.type]}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Chaînes', p.liveCount],
                  ['Films', p.vodCount],
                  ['Séries', p.seriesCount],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-xl bg-surface-2 px-2 py-3">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{nf.format(n as number)}</dd>
                  </div>
                ))}
              </dl>
              {p.status === 'error' && p.lastError && <p className="text-sm text-danger">{p.lastError}</p>}
              <div className="mt-auto space-y-3">
                <p className="text-sm text-muted">{p.lastSyncAt ? 'Synchro : ' + df.format(p.lastSyncAt) : 'Jamais synchronisée'}</p>
                <div className="flex flex-wrap gap-2">
                  <form action={syncPlaylist}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn-ghost h-9 px-4" disabled={p.status === 'syncing'}>
                      Synchroniser
                    </button>
                  </form>
                  <Link href={`/playlists/${p.id}?tab=settings`} className="btn-ghost h-9 px-4">
                    Modifier
                  </Link>
                  <form action={deletePlaylist} className="ml-auto">
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmButton message={`Supprimer « ${p.name} » ?`} className="btn-danger h-9 px-4">
                      Supprimer
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
