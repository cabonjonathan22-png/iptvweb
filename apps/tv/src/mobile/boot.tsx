import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { TvMeResponse } from '@iptv/shared';
import './mobile.css';
import { api, ApiError, setUnauthorizedHandler } from '../lib/api';
import { registerServiceWorker } from '../lib/install';
import { session } from '../lib/session';
import { storage } from '../lib/storage';
import { player } from '../player/engine';
import { MobileCtx, type MobileApi, type Route, type Tab } from './context';
import { dropBack, pushBack } from './nav';
import { LivePlayer, VodPlayer } from './Player';
import { BrowseScreen, HomeScreen, LiveScreen, MovieScreen, PairingScreen, SearchScreen, SettingsScreen, ShowScreen } from './screens';
import { Icon } from './ui';

const TABS: [Tab, string][] = [
  ['home', 'Accueil'],
  ['live', 'Direct'],
  ['movies', 'Films'],
  ['series', 'Séries'],
  ['search', 'Recherche'],
  ['settings', 'Réglages'],
];

type Entry = { key: number; route: Route; onBack?: () => void };

let seq = 0;

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'live':
      return <LiveScreen />;
    case 'movies':
      return <BrowseScreen key="vod" kind="vod" />;
    case 'series':
      return <BrowseScreen key="series" kind="series" />;
    case 'search':
      return <SearchScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'movie':
      return <MovieScreen id={route.id} />;
    case 'show':
      return <ShowScreen id={route.id} />;
    case 'playLive':
      return <LivePlayer channel={route.channel} source={route.source} index={route.index} />;
    case 'playVod':
      return <VodPlayer playback={route.playback} />;
  }
}

function MobileApp() {
  const [phase, setPhase] = useState<'boot' | 'pairing' | 'ready' | 'error'>('boot');
  const [me, setMe] = useState<TvMeResponse | null>(null);
  const [bootError, setBootError] = useState('');
  const [tab, setTab] = useState<Tab>('home');
  const [stack, setStack] = useState<Entry[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  /** Retour depuis un autre onglet : revient à l'accueil avant de quitter l'app. */
  const tabBack = useRef<{ fn: () => void; release: () => void } | null>(null);

  const api_: Omit<MobileApi, 'me' | 'tab'> = useMemo(() => {
    const clearStack = () => {
      stackRef.current.forEach((e) => e.onBack && dropBack(e.onBack));
      setStack([]);
    };
    const toPairing = () => {
      storage.setToken(null);
      clearStack();
      setMe(null);
      setPhase('pairing');
    };
    return {
      go: (t) => {
        clearStack();
        setTab(t);
        if (t === 'home') {
          if (tabBack.current) tabBack.current.release();
          tabBack.current = null;
        } else if (!tabBack.current) {
          const fn = () => {
            tabBack.current = null;
            setStack([]);
            setTab('home');
          };
          tabBack.current = { fn, release: pushBack(fn) };
        }
      },
      push: (route) => {
        const key = ++seq;
        const onBack = () => setStack((s) => s.filter((e) => e.key !== key));
        pushBack(onBack);
        setStack((s) => s.concat([{ key, route, onBack }]));
      },
      reset: toPairing,
      boot: () => {
        if (!storage.getToken()) {
          setPhase('pairing');
          return;
        }
        api
          .me()
          .then((m) => {
            setMe(m);
            setPhase('ready');
            api
              .settings()
              .then((st) => (session.settings = st))
              .catch(() => undefined);
          })
          .catch((e: ApiError) => {
            if (e.status === 401) toPairing();
            else {
              setBootError(e.message || 'Connexion impossible au serveur.');
              setPhase('error');
            }
          });
      },
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(api_.reset);
    api_.boot();
  }, []);
  useEffect(() => {
    if (phase === 'boot') return;
    const el = document.getElementById('boot');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }, [phase]);

  const ctx = useMemo<MobileApi>(() => ({ ...api_, me, tab }), [api_, me, tab]);
  const top = stack[stack.length - 1];
  const playing = !!top && (top.route.name === 'playLive' || top.route.name === 'playVod');

  return (
    <MobileCtx.Provider value={ctx}>
      {phase === 'pairing' && <PairingScreen />}
      {phase === 'error' && (
        <div class="m-screen m-empty">
          <h2>Connexion impossible</h2>
          <p>{bootError}</p>
          <button class="m-btn m-btn-primary" onClick={api_.boot}>
            Réessayer
          </button>
        </div>
      )}
      {phase === 'ready' && (
        <>
          <div class="m-main">
            {/* Les écrans du dessous restent montés : on retrouve leur position de défilement. */}
            <div class="m-layer" key={'tab-' + tab} style={stack.length ? { visibility: 'hidden' } : undefined}>
              <RouteView route={{ name: tab }} />
            </div>
            {stack.map((e, i) => (
              <div class="m-layer" key={e.key} style={i < stack.length - 1 ? { visibility: 'hidden' } : undefined}>
                <RouteView route={e.route} />
              </div>
            ))}
          </div>
          {!playing && <nav class="m-tabs" aria-label="Navigation principale">
            {TABS.map(([t, label]) => (
              <button key={t} class={'m-tab' + (t === tab && !stack.length ? ' is-on' : '')} aria-current={t === tab ? 'page' : undefined} onClick={() => api_.go(t)}>
                <Icon name={t} size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>}
        </>
      )}
    </MobileCtx.Provider>
  );
}

/** Vidéo fixe, hors de l'arbre Preact : seul le CSS la place selon l'orientation. */
function mountVideo() {
  const layer = document.createElement('div');
  layer.id = 'video-layer';
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('preload', 'auto');
  layer.appendChild(video);
  document.body.appendChild(layer);
  player.attach(video);
  player.subscribe(() => {
    document.documentElement.classList.toggle('m-video-on', player.view.mode !== 'hidden');
  });
}

export function boot(root: HTMLElement) {
  mountVideo();
  registerServiceWorker();
  render(<MobileApp />, root);
}
