import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { TvMeResponse } from '@iptv/shared';
import { AppCtx, type AppApi, type Entry, type ScreenName } from './app-context';
import { api, ApiError, setUnauthorizedHandler } from './lib/api';
import { storage } from './lib/storage';
import { focus } from './nav/focus';
import { FocusLayer, keyHandlers } from './nav/hooks';
import { DEBUG_SEQUENCE, mapKey, type Action } from './nav/keys';
import { Button } from './components/Button';
import { Dialog } from './components/Dialog';
import { PairingScreen } from './screens/Pairing';
import { HomeScreen } from './screens/Home';
import { LiveScreen } from './screens/Live';
import { SettingsScreen } from './screens/Settings';
import { KeyDebugScreen } from './screens/KeyDebug';

const SCREENS: { [K in ScreenName]: () => preact.JSX.Element } = {
  pairing: PairingScreen,
  home: HomeScreen,
  live: LiveScreen,
  settings: SettingsScreen,
  keydebug: KeyDebugScreen,
};

let entrySeq = 0;
const entry = (name: ScreenName, params?: Record<string, unknown>): Entry => ({
  key: name + '#' + ++entrySeq,
  name,
  params,
});

export function App() {
  /** Pile d'écrans. Seul le sommet est monté (mémoire limitée sur TV). */
  const [stack, setStack] = useState<Entry[]>([]);
  const [me, setMe] = useState<TvMeResponse | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const booting = useRef<Promise<void> | null>(null);

  const app: AppApi = useMemo(() => {
    const reset = (name: ScreenName) => setStack([entry(name)]);
    const toPairing = () => {
      storage.setToken(null);
      setMe(null);
      reset('pairing');
    };
    return {
      me: null,
      push: (name, params) => setStack((s) => s.concat([entry(name, params)])),
      back: () => {
        if (stackRef.current.length > 1) setStack((s) => s.slice(0, -1));
        else setExitOpen(true); // jamais de fermeture involontaire depuis l'écran racine
      },
      reset,
      onUnauthorized: toPairing,
      boot: () => {
        if (booting.current) return;
        if (!storage.getToken()) {
          reset('pairing');
          return;
        }
        booting.current = api
          .me()
          .then((m) => {
            setMe(m);
            setBootError(null);
            const top = stackRef.current[stackRef.current.length - 1];
            if (!top || top.name === 'pairing') reset('home');
          })
          .catch((e: ApiError) => {
            if (e.status === 401) toPairing();
            else if (!stackRef.current.length) setBootError(e.message || 'Erreur inconnue');
          })
          .then(() => {
            booting.current = null;
          });
      },
    };
  }, []);
  const ctx = useMemo(() => ({ ...app, me }), [app, me]);

  // Démarrage + retrait du shell HTML.
  useEffect(() => {
    setUnauthorizedHandler(app.onUnauthorized);
    app.boot();
  }, []);
  useEffect(() => {
    if (stack.length || bootError) {
      const boot = document.getElementById('boot');
      if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
    }
  }, [stack.length, bootError]);

  // Dispatch global des touches.
  useEffect(() => {
    const seq: Action[] = [];
    const onKeyDown = (e: KeyboardEvent) => {
      const k = mapKey(e);
      if (!k) return;
      // Empêche le défilement natif et la navigation arrière du navigateur.
      e.preventDefault();

      if (!k.repeat) {
        seq.push(k.action);
        if (seq.length > DEBUG_SEQUENCE.length) seq.shift();
        if (seq.join() === DEBUG_SEQUENCE.join()) {
          seq.length = 0;
          app.push('keydebug');
          return;
        }
      }

      for (let i = keyHandlers.length - 1; i >= 0; i--) if (keyHandlers[i]!(k)) return;

      switch (k.action) {
        case 'up':
        case 'down':
        case 'left':
        case 'right':
          focus.move(k.action);
          break;
        case 'ok':
          if (!k.repeat) focus.select();
          break;
        case 'back':
          if (!k.repeat) app.back();
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Certaines TV transforment Retour en history.back() sans keydown : on garde
    // toujours une entrée d'historique « tampon » et on traite popstate comme Retour.
    const trap = () => {
      try {
        window.history.pushState({ oria: 1 }, '');
      } catch (_) {
        /* ignore */
      }
    };
    const onPop = () => {
      trap();
      app.back();
    };
    trap();
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const top = stack[stack.length - 1];
  const Screen = top ? SCREENS[top.name] : null;

  return (
    <AppCtx.Provider value={ctx}>
      {Screen && top && (
        <FocusLayer name={top.key} base key={top.key}>
          <Screen />
        </FocusLayer>
      )}
      {!Screen && bootError && <BootError message={bootError} onRetry={app.boot} />}
      {exitOpen && <ExitDialog onClose={() => setExitOpen(false)} />}
    </AppCtx.Provider>
  );
}

function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <FocusLayer name="boot-error" base>
      <div class="screen center">
        <h1 class="hero-title">Connexion impossible</h1>
        <p class="hero-sub">{message}</p>
        <div class="row-actions">
          <Button id="boot-retry" variant="primary" onSelect={onRetry} autoFocus>
            Réessayer
          </Button>
        </div>
      </div>
    </FocusLayer>
  );
}

function ExitDialog({ onClose }: { onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  const quit = () => {
    try {
      window.close();
    } catch (_) {
      /* ignore */
    }
    // Si l'app est toujours là, la TV n'autorise pas la fermeture par script.
    window.setTimeout(() => setFailed(true), 300);
  };
  return (
    <Dialog name="dlg-exit" title="Quitter l'application ?" onClose={onClose}>
      {failed && (
        <p class="dialog-text">Appuyez sur la touche Accueil (Home) de la télécommande pour quitter.</p>
      )}
      <div class="row-actions">
        <Button id="exit-cancel" variant="primary" onSelect={onClose} autoFocus>
          Rester
        </Button>
        <Button id="exit-ok" onSelect={quit}>
          Quitter
        </Button>
      </div>
    </Dialog>
  );
}
