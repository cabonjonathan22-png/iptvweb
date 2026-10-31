import { useEffect, useState } from 'preact/hooks';
import type { PlaylistSummary } from '@iptv/shared';
import { useApp } from '../app-context';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { api, ApiError } from '../lib/api';
import { storage } from '../lib/storage';
import { prefs, type LiveMode } from '../lib/prefs';
import { session } from '../lib/session';
import { useKeyHandler } from '../nav/hooks';

const LANGS: (string | null)[] = [null, 'fr', 'en', 'es', 'de', 'it', 'pt', 'ar'];
const LANG_LABEL: Record<string, string> = { fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien', pt: 'Portugais', ar: 'Arabe' };
const MODES: LiveMode[] = ['auto', 'hls', 'ts'];
const MODE_LABEL: Record<LiveMode, string> = { auto: 'Auto', hls: 'HLS', ts: 'MPEG-TS' };

const cycle = <T,>(list: T[], v: T) => list[(list.indexOf(v) + 1) % list.length]!;

type Panel = null | 'playlists' | 'pin' | 'unlink';

export function SettingsScreen() {
  const app = useApp();
  const [panel, setPanel] = useState<Panel>(null);
  const [, refresh] = useState(0);
  const s = session.settings;
  const me = app.me;

  const saveLang = (key: 'audioLang' | 'subtitleLang') => {
    const next = cycle(LANGS, s[key]);
    s[key] = next;
    refresh((n) => n + 1);
    api.saveSettings({ [key]: next }).catch(() => undefined);
  };

  return (
    <div class="screen">
      <ScreenHeader title="Réglages" backHint="Accueil" />
      <div class="settings">
        <div class="settings-menu">
          <Button id="set-playlist" autoFocus onSelect={() => setPanel('playlists')}>
            Playlist : {me && me.playlist ? me.playlist.name : 'aucune'}
          </Button>
          <Button id="set-audio" onSelect={() => saveLang('audioLang')}>
            Langue audio : {s.audioLang ? LANG_LABEL[s.audioLang] : 'par défaut'}
          </Button>
          <Button id="set-subs" onSelect={() => saveLang('subtitleLang')}>
            Sous-titres : {s.subtitleLang ? LANG_LABEL[s.subtitleLang] : 'désactivés'}
          </Button>
          <Button
            id="set-preview"
            onSelect={() => {
              prefs.preview = !prefs.preview;
              refresh((n) => n + 1);
            }}
          >
            Aperçu des chaînes : {prefs.preview ? 'activé' : 'désactivé'}
          </Button>
          <Button
            id="set-mode"
            onSelect={() => {
              prefs.liveMode = cycle(MODES, prefs.liveMode);
              refresh((n) => n + 1);
            }}
          >
            Format du direct : {MODE_LABEL[prefs.liveMode]}
          </Button>
          <Button id="set-pin" onSelect={() => setPanel('pin')}>
            Contrôle parental : {s.hasPin ? 'code défini' : 'aucun code'}
          </Button>
          <Button id="set-keys" onSelect={() => app.push('keydebug')}>
            Debug touches
          </Button>
          <Button id="set-unlink" variant="danger" onSelect={() => setPanel('unlink')}>
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
          <dd class="small">{navigator.userAgent}</dd>
        </dl>
      </div>

      {panel === 'playlists' && <PlaylistsDialog onClose={() => setPanel(null)} />}
      {panel === 'pin' && (
        <PinSetupDialog
          hasPin={s.hasPin}
          onClose={() => setPanel(null)}
          onDone={(has) => {
            s.hasPin = has;
            setPanel(null);
          }}
        />
      )}
      {panel === 'unlink' && <UnlinkDialog onClose={() => setPanel(null)} />}
    </div>
  );
}

function PlaylistsDialog({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [list, setList] = useState<PlaylistSummary[] | null>(null);
  useEffect(() => {
    api.playlists().then(setList).catch(() => setList([]));
  }, []);
  return (
    <Dialog name="dlg-playlists" title="Playlist active" onClose={onClose}>
      {!list && <p class="dialog-text">Chargement…</p>}
      {list && !list.length && <p class="dialog-text">Aucune playlist : ajoutez-en une depuis le dashboard.</p>}
      <div class="dialog-list">
        {list &&
          list.map((p, i) => (
            <Button
              key={p.id}
              id={'pl-' + p.id}
              variant={p.active ? 'primary' : 'ghost'}
              autoFocus={p.active || (i === 0 && !list.some((x) => x.active))}
              onSelect={() =>
                api.setActivePlaylist(p.id).then(() => {
                  onClose();
                  app.boot();
                })
              }
            >
              {p.name}
              {p.status === 'syncing' ? ' (synchronisation…)' : ''}
            </Button>
          ))}
      </div>
    </Dialog>
  );
}

/** Définir / changer / supprimer le code parental, saisi aux chiffres de la télécommande. */
function PinSetupDialog({ hasPin, onClose, onDone }: { hasPin: boolean; onClose: () => void; onDone: (has: boolean) => void }) {
  type Step = 'current' | 'new' | 'confirm';
  const [step, setStep] = useState<Step>(hasPin ? 'current' : 'new');
  const [current, setCurrent] = useState('');
  const [first, setFirst] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const fail = (e: ApiError) => {
    setError(e.message);
    setStep(hasPin ? 'current' : 'new');
  };

  const complete = (v: string) => {
    setValue('');
    if (step === 'current') {
      if (removing) {
        api.setPin(null, v).then(() => onDone(false), fail);
        return;
      }
      setCurrent(v);
      setStep('new');
    } else if (step === 'new') {
      setFirst(v);
      setStep('confirm');
    } else if (v !== first) {
      setError('Les deux codes ne correspondent pas.');
      setStep('new');
    } else {
      api.setPin(v, current || undefined).then(() => onDone(true), fail);
    }
  };

  useKeyHandler((k) => {
    if (k.action !== 'digit') return false;
    setError(null);
    const v = (value + k.digit).slice(0, 4);
    if (v.length === 4) complete(v);
    else setValue(v);
    return true;
  });

  const label = step === 'current' ? 'Code actuel' : step === 'new' ? 'Nouveau code (4 chiffres)' : 'Confirmez le nouveau code';
  return (
    <Dialog name="dlg-pin-setup" title="Contrôle parental" onClose={onClose}>
      <p class="dialog-text">{label} : utilisez les chiffres de la télécommande.</p>
      <div class="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} class={'pin-dot' + (i < value.length ? ' is-filled' : '')} />
        ))}
      </div>
      {error && <p class="dialog-text error-text">{error}</p>}
      <div class="row-actions">
        <Button id="pin-cancel" autoFocus onSelect={onClose}>
          Annuler
        </Button>
        {hasPin && !removing && (
          <Button
            id="pin-remove"
            variant="danger"
            onSelect={() => {
              setRemoving(true);
              setStep('current');
              setValue('');
            }}
          >
            Supprimer le code
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function UnlinkDialog({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
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
  return (
    <Dialog name="dlg-unlink" title="Délier cette TV ?" onClose={onClose}>
      <p class="dialog-text">Il faudra saisir un nouveau code depuis le dashboard pour la réutiliser.</p>
      <div class="row-actions">
        <Button id="unlink-cancel" onSelect={onClose} autoFocus>
          Annuler
        </Button>
        <Button id="unlink-ok" variant="danger" onSelect={busy ? undefined : unlink}>
          {busy ? 'Déliaison…' : 'Délier'}
        </Button>
      </div>
    </Dialog>
  );
}
