'use client';

import { useActionState } from 'react';
import { updatePlaylist, type PlaylistFormState } from '@/app/actions/playlists';

export interface EditablePlaylist {
  id: string;
  name: string;
  type: 'm3u_url' | 'm3u_file' | 'xtream';
  sourceUrl: string | null;
  epgUrl: string | null;
  epgAuto: boolean;
  /** Serveur et identifiant Xtream (jamais le mot de passe). */
  server?: string;
  username?: string;
}

export function PlaylistEditForm({ p }: { p: EditablePlaylist }) {
  const [state, action, pending] = useActionState<PlaylistFormState, FormData>(updatePlaylist, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={p.id} />
      <div>
        <label htmlFor="e-name" className="label">
          Nom
        </label>
        <input id="e-name" name="name" defaultValue={p.name} maxLength={80} className="input" />
      </div>
      {p.type === 'm3u_url' && (
        <div>
          <label htmlFor="e-url" className="label">
            URL de la playlist
          </label>
          <input id="e-url" name="url" defaultValue={p.sourceUrl ?? ''} className="input" />
        </div>
      )}
      {p.type === 'xtream' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="e-server" className="label">
              Serveur
            </label>
            <input id="e-server" name="server" defaultValue={p.server} className="input" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="e-user" className="label">
              Identifiant
            </label>
            <input id="e-user" name="username" defaultValue={p.username} className="input" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="e-pass" className="label">
              Mot de passe
            </label>
            <input id="e-pass" name="password" type="password" placeholder="Inchangé" className="input" autoComplete="new-password" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="epgAuto" defaultChecked={p.epgAuto} className="size-4 accent-accent" />
            Utiliser le guide TV fourni par le serveur
          </label>
        </div>
      )}
      <div>
        <label htmlFor="e-epg" className="label">
          Guide TV XMLTV
        </label>
        <input id="e-epg" name="epgUrl" defaultValue={p.epgUrl ?? ''} placeholder="https://…/epg.xml.gz" className="input" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state && !state.error && <p className="text-sm text-ok">Modifications enregistrées.</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
