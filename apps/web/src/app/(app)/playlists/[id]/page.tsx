import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { imageUrl } from '@/lib/images';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { XtreamCreds } from '@iptv/shared';
import { requireUser } from '@/auth';
import { getDb, schema } from '@/lib/db';
import { decryptJson } from '@/lib/crypto';
import { ownedPlaylist, TYPE_LABELS } from '@/lib/playlists';
import { StatusBadge } from '@/components/StatusBadge';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Thumb } from '@/components/Thumb';
import { ConfirmButton } from '@/components/ConfirmButton';
import { PlaylistEditForm } from '@/components/PlaylistEditForm';
import { ReuploadForm } from '@/components/ReuploadForm';
import { TestPlayButton } from '@/components/TestPlayer';
import { SyncProgress } from '@/components/SyncProgress';
import { SyncDoneBanner } from '@/components/SyncDoneBanner';
import { SaveButton } from '@/components/SaveButton';
import { deletePlaylist, syncPlaylist, updateCategory } from '@/app/actions/playlists';

export const metadata: Metadata = { title: 'Playlist' };

type Kind = 'live' | 'vod' | 'series';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'live', label: 'TV en direct' },
  { id: 'vod', label: 'Films' },
  { id: 'series', label: 'Séries' },
];
const TABS = [
  { id: 'categories', label: 'Catégories' },
  { id: 'preview', label: 'Aperçu' },
  { id: 'settings', label: 'Modifier' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const PAGE = 60;
const nf = new Intl.NumberFormat('fr-FR');
const df = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

const tableOf = (k: Kind) => (k === 'live' ? schema.channels : k === 'vod' ? schema.vodItems : schema.series);

export default async function PlaylistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; kind?: string; q?: string; page?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const p = await ownedPlaylist(user.id, id);
  if (!p) notFound();

  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : 'categories';
  const kind: Kind = KINDS.some((k) => k.id === sp.kind) ? (sp.kind as Kind) : 'live';
  const href = (o: { tab?: Tab; kind?: Kind; q?: string; page?: number }) => {
    const u = new URLSearchParams({ tab: o.tab ?? tab, kind: o.kind ?? kind });
    if (o.q) u.set('q', o.q);
    if (o.page) u.set('page', String(o.page));
    return `/playlists/${p.id}?${u}`;
  };

  const db = await getDb();
  const job =
    p.status === 'syncing'
      ? await db.query.syncJobs.findFirst({
          where: eq(schema.syncJobs.playlistId, p.id),
          orderBy: desc(schema.syncJobs.createdAt),
        })
      : null;
  const counts: Record<Kind, number> = { live: p.liveCount, vod: p.vodCount, series: p.seriesCount };

  return (
    <div className="space-y-6">
      <AutoRefresh active={p.status === 'syncing'} />
      <div>
        <Link href="/playlists" className="text-sm text-muted hover:text-fg">
          ← Playlists
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight">{p.name}</h1>
          <StatusBadge status={p.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {TYPE_LABELS[p.type]}
          {p.lastSyncAt && ' · dernière synchro ' + df.format(p.lastSyncAt)}
          {p.meta.expiresAt ? ' · abonnement jusqu’au ' + new Date(p.meta.expiresAt).toLocaleDateString('fr-FR') : ''}
          {p.meta.epgPrograms !== undefined && ' · guide TV : ' + nf.format(p.meta.epgPrograms) + ' programmes'}
        </p>
        {p.meta.epgError && <p className="mt-1 text-sm text-danger">{p.meta.epgError}</p>}
      </div>

      <section className="card flex flex-wrap items-center gap-4">
        <dl className="flex flex-1 flex-wrap gap-6">
          {KINDS.map((k) => (
            <div key={k.id}>
              <dt className="text-xs text-muted">{k.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{nf.format(counts[k.id])}</dd>
            </div>
          ))}
        </dl>
        {p.status === 'syncing' ? (
          <SyncProgress type={p.type} phase={job?.phase ?? null} cursor={job?.cursor ?? 0} />
        ) : (
          <form action={syncPlaylist}>
            <input type="hidden" name="id" value={p.id} />
            <SaveButton className="btn-ghost" pendingLabel="Démarrage…" doneLabel="✓ Lancée">
              Synchroniser maintenant
            </SaveButton>
          </form>
        )}
        <SyncDoneBanner status={p.status} live={p.liveCount} vod={p.vodCount} series={p.seriesCount} />
        {p.status === 'error' && p.lastError && (
          <p role="alert" className="w-full rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {p.lastError}
          </p>
        )}
      </section>

      <nav className="flex gap-1 border-b border-line" aria-label="Sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={href({ tab: t.id })}
            aria-current={tab === t.id ? 'page' : undefined}
            className={
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ' +
              (tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab !== 'settings' && (
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Link
              key={k.id}
              href={href({ kind: k.id, q: sp.q })}
              className={
                'rounded-full px-4 py-1.5 text-sm ' +
                (kind === k.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted hover:text-fg')
              }
            >
              {k.label}
            </Link>
          ))}
        </div>
      )}

      {tab === 'categories' && <Categories playlistId={p.id} kind={kind} />}
      {tab === 'preview' && (
        <Preview playlistId={p.id} kind={kind} q={sp.q ?? ''} page={Math.max(1, Number(sp.page) || 1)} href={href} />
      )}
      {tab === 'settings' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section className="card">
            <h2 className="mb-4 font-semibold">Source</h2>
            <PlaylistEditForm
              p={{
                id: p.id,
                name: p.name,
                type: p.type,
                sourceUrl: p.sourceUrl,
                epgUrl: p.epgUrl,
                epgAuto: p.epgAuto,
                ...(p.type === 'xtream' && p.credentialsEnc
                  ? (({ server, username }) => ({ server, username }))(decryptJson<XtreamCreds>(p.credentialsEnc))
                  : {}),
              }}
            />
            {p.type === 'm3u_file' && (
              <div className="mt-6 border-t border-line pt-6">
                <p className="mb-3 text-sm text-muted">Fichier actuel : {p.meta.fileName ?? '—'}</p>
                <ReuploadForm playlistId={p.id} />
              </div>
            )}
          </section>
          <section className="card h-fit">
            <h2 className="font-semibold">Supprimer</h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              Supprime la playlist, ses catégories, favoris et reprises associés.
            </p>
            <form action={deletePlaylist}>
              <input type="hidden" name="id" value={p.id} />
              <ConfirmButton message={`Supprimer « ${p.name} » ?`} className="btn-danger w-full">
                Supprimer la playlist
              </ConfirmButton>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Catégories */

async function Categories({ playlistId, kind }: { playlistId: string; kind: Kind }) {
  const db = await getDb();
  const c = schema.categories;
  const t = tableOf(kind);
  const rows = await db
    .select({
      id: c.id,
      name: c.name,
      customName: c.customName,
      hidden: c.hidden,
      locked: c.locked,
      n: count(t.id),
    })
    .from(c)
    .leftJoin(t, eq(t.categoryId, c.id))
    .where(and(eq(c.playlistId, playlistId), eq(c.kind, kind)))
    .groupBy(c.id)
    .orderBy(asc(c.sortOrder), asc(c.id));

  if (!rows.length) return <p className="card text-center text-muted">Aucune catégorie.</p>;

  const op = (categoryId: number, o: string, label: string, extra?: string) => (
    <form action={updateCategory}>
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="op" value={o} />
      <button className={'rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 ' + (extra ?? 'text-muted')} aria-label={label} title={label}>
        {label}
      </button>
    </form>
  );

  return (
    <div className="card p-0 sm:p-0">
      <p className="border-b border-line px-5 py-3 text-xs text-muted">
        L&apos;ordre, les noms et les catégories masquées sont repris tels quels sur vos TV et conservés lors des
        synchronisations. Les catégories verrouillées demanderont le code PIN parental (à définir dans les réglages).
      </p>
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.id} className={'flex flex-wrap items-center gap-2 px-4 py-2.5 sm:flex-nowrap ' + (r.hidden ? 'opacity-50' : '')}>
            <form action={updateCategory} className="flex min-w-0 flex-1 items-center gap-2">
              <input type="hidden" name="categoryId" value={r.id} />
              <input type="hidden" name="op" value="rename" />
              <input
                name="name"
                defaultValue={r.customName ?? r.name}
                aria-label="Nom de la catégorie"
                className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-line focus:border-accent focus:outline-none"
              />
              <span className="shrink-0 text-xs text-muted tabular-nums">{nf.format(r.n)}</span>
            </form>
            <div className="flex shrink-0 items-center">
              {i > 0 ? op(r.id, 'up', '↑') : <span className="w-8" />}
              {i < rows.length - 1 ? op(r.id, 'down', '↓') : <span className="w-8" />}
              {r.hidden ? op(r.id, 'show', 'Afficher', 'text-fg') : op(r.id, 'hide', 'Masquer')}
              {r.locked ? op(r.id, 'unlock', 'Verrouillée', 'text-accent-strong') : op(r.id, 'lock', 'Verrouiller')}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Aperçu */

async function Preview({
  playlistId,
  kind,
  q,
  page,
  href,
}: {
  playlistId: string;
  kind: Kind;
  q: string;
  page: number;
  href: (o: { q?: string; page?: number }) => string;
}) {
  const db = await getDb();
  const t = tableOf(kind);
  const c = schema.categories;
  const needle = q.trim().toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m);
  const where = and(eq(t.playlistId, playlistId), needle ? sql`lower(${t.name}) like ${'%' + needle + '%'}` : undefined);
  const image = kind === 'live' ? schema.channels.logo : kind === 'vod' ? schema.vodItems.poster : schema.series.poster;

  const rows = await db
    .select({ id: t.id, name: t.name, image, category: sql<string | null>`coalesce(${c.customName}, ${c.name})` })
    .from(t)
    .leftJoin(c, eq(c.id, t.categoryId))
    .where(where)
    .orderBy(asc(c.sortOrder), asc(t.sortOrder))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  const hasNext = rows.length > PAGE;
  // Images des playlists souvent en http:// : servies via le proxy d'images (HTTPS, redimensionnées).
  const h = await headers();
  const origin = (h.get('x-forwarded-proto') || 'http') + '://' + (h.get('x-forwarded-host') || h.get('host'));

  return (
    <div className="space-y-4">
      <form className="flex gap-2" action="" method="get">
        <input type="hidden" name="tab" value="preview" />
        <input type="hidden" name="kind" value={kind} />
        <input name="q" defaultValue={q} placeholder="Rechercher…" aria-label="Rechercher" className="input" />
        <button className="btn-ghost">Rechercher</button>
      </form>
      {rows.length === 0 ? (
        <p className="card text-center text-muted">{q ? 'Aucun résultat.' : 'Rien ici pour le moment.'}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.slice(0, PAGE).map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <Thumb
                src={kind === 'live' ? imageUrl(origin, r.image, 'logo', 96) : imageUrl(origin, r.image, 'poster', 240)}
                name={r.name}
                className={kind === 'live' ? 'size-10' : 'h-14 w-10'}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted">{r.category ?? 'Sans catégorie'}</p>
              </div>
              {kind !== 'series' && <TestPlayButton playlistId={playlistId} kind={kind} id={r.id} name={r.name} />}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between">
        {page > 1 ? (
          <Link className="btn-ghost h-9" href={href({ q, page: page - 1 })}>
            ← Précédent
          </Link>
        ) : (
          <span />
        )}
        {hasNext && (
          <Link className="btn-ghost h-9" href={href({ q, page: page + 1 })}>
            Suivant →
          </Link>
        )}
      </div>
    </div>
  );
}
