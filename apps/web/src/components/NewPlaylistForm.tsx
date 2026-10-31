'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { createPlaylist, type PlaylistFormState } from '@/app/actions/playlists';
import { uploadPlaylistFile } from '@/lib/upload-client';

type Kind = 'xtream' | 'm3u_url' | 'm3u_file';

const TABS: { id: Kind; label: string; hint: string }[] = [
  { id: 'xtream', label: 'Xtream Codes', hint: 'Serveur, identifiant et mot de passe' },
  { id: 'm3u_url', label: 'Lien M3U', hint: 'URL .m3u / .m3u8' },
  { id: 'm3u_file', label: 'Fichier M3U', hint: 'Depuis votre ordinateur' },
];

export function NewPlaylistForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('xtream');
  const [state, action, pending] = useActionState<PlaylistFormState, FormData>(createPlaylist, undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  // React réinitialise le formulaire après l'action : on garde le fichier de côté au submit.
  const pendingFile = useRef<File | null>(null);
  const [upload, setUpload] = useState<{ busy: boolean; error?: string }>({ busy: false });

  // Après création d'une playlist « fichier » : envoi du contenu.
  useEffect(() => {
    const id = state?.playlistId;
    const file = pendingFile.current;
    if (!id || !file) return;
    let cancelled = false;
    (async () => {
      setUpload({ busy: true });
      try {
        await uploadPlaylistFile(id, file);
        if (!cancelled) router.push('/playlists/' + id);
      } catch (e) {
        if (!cancelled) {
          setUpload({ busy: false, error: (e as Error).message + ' La playlist a été créée : vous pouvez renvoyer le fichier depuis sa page.' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state?.playlistId, router]);

  const busy = pending || upload.busy;
  const v = state?.values ?? {};
  const error = upload.error || state?.error;

  return (
    <form
      action={action}
      onSubmit={() => {
        pendingFile.current = fileRef.current?.files?.[0] ?? null;
      }}
      className="space-y-6"
    >
      <input type="hidden" name="type" value={kind} />
      <div role="tablist" aria-label="Type de source" className="grid gap-2 sm:grid-cols-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={kind === t.id}
            onClick={() => setKind(t.id)}
            className={
              'rounded-xl border px-4 py-3 text-left transition-colors ' +
              (kind === t.id ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-muted')
            }
          >
            <span className="block font-semibold">{t.label}</span>
            <span className="block text-xs text-muted">{t.hint}</span>
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="name" className="label">
          Nom
        </label>
        <input id="name" name="name" defaultValue={v.name} maxLength={80} placeholder="Mon fournisseur" className="input" />
      </div>

      {kind === 'xtream' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="server" className="label">
              Adresse du serveur
            </label>
            <input id="server" name="server" defaultValue={v.server} required inputMode="url" placeholder="http://exemple.com:8080" className="input" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="username" className="label">
              Identifiant
            </label>
            <input id="username" name="username" defaultValue={v.username} required className="input" autoComplete="off" spellCheck={false} />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Mot de passe
            </label>
            <input id="password" name="password" type="password" required className="input" autoComplete="off" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="epgAuto" defaultChecked={state?.values ? v.epgAuto === 'on' : true} className="size-4 accent-accent" />
            Utiliser le guide TV fourni par le serveur (xmltv.php)
          </label>
        </div>
      )}

      {kind === 'm3u_url' && (
        <div>
          <label htmlFor="url" className="label">
            URL de la playlist
          </label>
          <input id="url" name="url" defaultValue={v.url} required inputMode="url" placeholder="https://…/playlist.m3u" className="input" />
        </div>
      )}

      {kind === 'm3u_file' && (
        <div>
          <label htmlFor="file" className="label">
            Fichier .m3u / .m3u8
          </label>
          <input
            ref={fileRef}
            id="file"
            type="file"
            required
            accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"
            className="block w-full text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-surface-2 file:px-4 file:py-2.5 file:font-semibold file:text-fg"
          />
          <p className="mt-1.5 text-xs text-muted">Compressé avant l&apos;envoi. Jusqu&apos;à ~40 Mo selon le contenu.</p>
        </div>
      )}

      <div>
        <label htmlFor="epgUrl" className="label">
          Guide TV XMLTV <span className="font-normal">(optionnel)</span>
        </label>
        <input id="epgUrl" name="epgUrl" defaultValue={v.epgUrl} inputMode="url" placeholder="https://…/epg.xml.gz" className="input" />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary w-full sm:w-auto">
        {upload.busy ? 'Envoi du fichier…' : pending ? (kind === 'xtream' ? 'Vérification du compte…' : 'Ajout…') : 'Ajouter la playlist'}
      </button>
    </form>
  );
}
