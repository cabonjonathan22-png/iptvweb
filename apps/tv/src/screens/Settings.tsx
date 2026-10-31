import { useState } from 'preact/hooks';
import { useApp } from '../app-context';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { api } from '../lib/api';
import { storage } from '../lib/storage';
import { prefs, type LiveMode } from '../lib/prefs';

/** Réglages (étape 1 : infos appareil + déliaison). Le reste arrive à l'étape 9. */
export function SettingsScreen() {
  const app = useApp();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(prefs.preview);
  const [liveMode, setLiveMode] = useState<LiveMode>(prefs.liveMode);
  const MODES: LiveMode[] = ['auto', 'hls', 'ts'];
  const MODE_LABEL: Record<LiveMode, string> = { auto: 'Auto', hls: 'HLS', ts: 'MPEG-TS' };

  const unlink = () => {
    setBusy(true);
    // Même si l'appel échoue (hors ligne), on oublie le token localement.
    api
      .unlink()
      .catch(() => undefined)
      .then(() => {
        storage.setToken(null);
        app.reset('pairing');
      });
  };

  const me = app.me;
  const ua = navigator.userAgent;

  return (
    <div class="screen">
      <ScreenHeader title="Réglages" backHint="Accueil" />
      <div class="settings">
        <div class="settings-menu">
          <Button
            id="set-preview"
            autoFocus
            onSelect={() => {
              prefs.preview = !preview;
              setPreview(!preview);
            }}
          >
            Aperçu des chaînes : {preview ? 'activé' : 'désactivé'}
          </Button>
          <Button
            id="set-mode"
            onSelect={() => {
              const next = MODES[(MODES.indexOf(liveMode) + 1) % MODES.length]!;
              prefs.liveMode = next;
              setLiveMode(next);
            }}
          >
            Format du direct : {MODE_LABEL[liveMode]}
          </Button>
          <Button id="set-keys" onSelect={() => app.push('keydebug')}>
            Debug touches
          </Button>
          <Button id="set-unlink" variant="danger" onSelect={() => setConfirmUnlink(true)}>
            Délier cette TV
          </Button>
        </div>
        <dl class="info-list">
          <dt>Nom</dt>
          <dd>{me ? me.device.name : '—'}</dd>
          <dt>Compte</dt>
          <dd>{(me && me.account.email) || '—'}</dd>
          <dt>Appareil</dt>
          <dd class="mono">{me ? me.device.id : '—'}</dd>
          <dt>Écran</dt>
          <dd>
            {window.innerWidth}×{window.innerHeight} @{window.devicePixelRatio || 1}x
          </dd>
          <dt>Navigateur</dt>
          <dd class="small">{ua}</dd>
        </dl>
      </div>

      {confirmUnlink && (
        <Dialog name="dlg-unlink" title="Délier cette TV ?" onClose={() => setConfirmUnlink(false)}>
          <p class="dialog-text">Il faudra saisir un nouveau code depuis le dashboard pour la réutiliser.</p>
          <div class="row-actions">
            <Button id="unlink-cancel" onSelect={() => setConfirmUnlink(false)} autoFocus>
              Annuler
            </Button>
            <Button id="unlink-ok" variant="danger" onSelect={busy ? undefined : unlink}>
              {busy ? 'Déliaison…' : 'Délier'}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
