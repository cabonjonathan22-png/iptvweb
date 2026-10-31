import type { Metadata } from 'next';
import { currentUser } from '@/auth';
import { getDb } from '@/lib/db';
import { LinkForm } from '@/components/LinkForm';
import { ConfirmButton } from '@/components/ConfirmButton';
import { assignPlaylist, renameDevice, revokeDevice } from '@/app/actions/devices';

export const metadata: Metadata = { title: 'Appareils' };

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function ago(d: Date | null): string {
  if (!d) return 'jamais';
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return 'à l’instant';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ linked?: string }> }) {
  const { linked } = await searchParams;
  const user = (await currentUser())!;
  const db = await getDb();
  const [devices, playlists] = await Promise.all([
    db.query.devices.findMany({
      columns: { id: true, name: true, lastSeenAt: true, createdAt: true, playlistId: true },
      where: (d, { eq }) => eq(d.userId, user.id),
      orderBy: (d, { desc }) => desc(d.createdAt),
    }),
    db.query.playlists.findMany({
      columns: { id: true, name: true },
      where: (p, { eq }) => eq(p.userId, user.id),
      orderBy: (p, { asc }) => asc(p.name),
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Appareils</h1>
        <p className="mt-1 text-muted">Les TV liées à votre compte.</p>
      </div>

      {linked && (
        <p role="status" className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
          « {linked} » est liée. La TV va s&apos;actualiser d&apos;elle-même dans quelques secondes.
        </p>
      )}

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          {devices.length === 0 ? (
            <div className="card text-center text-muted">
              Aucune TV liée pour l&apos;instant. Ouvrez l&apos;app sur votre TV et saisissez le code ci-contre.
            </div>
          ) : (
            devices.map((d) => (
              <article key={d.id} className="card space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <form action={renameDevice} className="flex min-w-0 flex-1 gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <input
                      name="name"
                      defaultValue={d.name}
                      aria-label="Nom de la TV"
                      maxLength={60}
                      className="input h-10 min-w-0 flex-1 font-semibold"
                    />
                    <button className="btn-ghost h-10">Renommer</button>
                  </form>
                </div>
                <p className="text-sm text-muted">
                  Dernière connexion : {ago(d.lastSeenAt)} · liée le{' '}
                  {d.createdAt.toLocaleDateString('fr-FR')}
                </p>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <form action={assignPlaylist} className="flex min-w-0 flex-1 gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <select
                      name="playlistId"
                      defaultValue={d.playlistId ?? ''}
                      aria-label="Playlist active"
                      disabled={playlists.length === 0}
                      className="input h-10 min-w-0 flex-1"
                    >
                      <option value="">{playlists.length ? 'Aucune playlist' : 'Ajoutez d’abord une playlist'}</option>
                      {playlists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn-ghost h-10" disabled={playlists.length === 0}>
                      Assigner
                    </button>
                  </form>
                  <form action={revokeDevice}>
                    <input type="hidden" name="id" value={d.id} />
                    <ConfirmButton
                      message={`Révoquer « ${d.name} » ? La TV devra être liée à nouveau.`}
                      className="btn-danger h-10"
                    >
                      Révoquer
                    </ConfirmButton>
                  </form>
                </div>
              </article>
            ))
          )}
        </div>

        <aside className="card h-fit">
          <h2 className="font-semibold">Lier une nouvelle TV</h2>
          <p className="mt-1 mb-5 text-sm text-muted">Saisissez le code affiché sur l&apos;écran de la TV.</p>
          <LinkForm />
        </aside>
      </section>
    </div>
  );
}
