'use client';

import { useActionState } from 'react';
import type { TvSettings } from '@iptv/shared';
import { savePin, savePreferences, type SettingsState } from '@/app/actions/settings';

const LANGS = [
  ['', 'Par défaut du flux'],
  ['fr', 'Français'],
  ['en', 'Anglais'],
  ['es', 'Espagnol'],
  ['de', 'Allemand'],
  ['it', 'Italien'],
  ['pt', 'Portugais'],
  ['ar', 'Arabe'],
] as const;

function Feedback({ state }: { state: SettingsState }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  if (state?.ok) return <p className="text-sm text-ok">{state.ok}</p>;
  return null;
}

export function PreferencesForm({ s }: { s: TvSettings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(savePreferences, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="audioLang" className="label">
            Langue audio préférée
          </label>
          <select id="audioLang" name="audioLang" defaultValue={s.audioLang ?? ''} className="input">
            {LANGS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="subtitleLang" className="label">
            Sous-titres préférés
          </label>
          <select id="subtitleLang" name="subtitleLang" defaultValue={s.subtitleLang ?? ''} className="input">
            <option value="">Désactivés</option>
            {LANGS.slice(1).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="playerMode" className="label">
            Format du direct
          </label>
          <select id="playerMode" name="playerMode" defaultValue={s.playerMode} className="input">
            <option value="auto">Automatique (recommandé)</option>
            <option value="hls">HLS (.m3u8)</option>
            <option value="ts">MPEG-TS (.ts)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" name="livePreview" defaultChecked={s.livePreview} className="size-4 accent-accent" />
          Aperçu automatique des chaînes
        </label>
      </div>
      <Feedback state={state} />
      <button className="btn-primary" disabled={pending}>
        Enregistrer
      </button>
    </form>
  );
}

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(savePin, undefined);
  const pinInput = (name: string, label: string) => (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input id={name} name={name} type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" className="input font-mono tracking-[0.5em]" />
    </div>
  );
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {hasPin && pinInput('currentPin', 'Code actuel')}
        {pinInput('pin', hasPin ? 'Nouveau code' : 'Code (4 chiffres)')}
        {pinInput('pinConfirm', 'Confirmation')}
      </div>
      <Feedback state={state} />
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={pending}>
          {hasPin ? 'Changer le code' : 'Définir le code'}
        </button>
        {hasPin && (
          <button name="remove" value="1" className="btn-danger" disabled={pending}>
            Supprimer le code
          </button>
        )}
      </div>
    </form>
  );
}
