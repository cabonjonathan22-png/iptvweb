import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError } from '../lib/api';
import { clock } from '../lib/format';
import { saveLocal } from '../lib/local-progress';
import { FocusLayer, useKeyHandler } from '../nav/hooks';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/Cards';
import { player } from './engine';
import { usePlayer } from './usePlayer';
import { TracksDialog } from './FullPlayer';

const OVERLAY_MS = 4000;
const SAVE_EVERY_MS = 10_000;
/** Délai sans appui avant d'appliquer un saut (on cumule les appuis successifs). */
const SEEK_COMMIT_MS = 600;
const NEXT_COUNTDOWN = 10;

export interface VodItem {
  kind: 'vod' | 'episode';
  id: number;
  title: string;
  subtitle?: string | null;
  startAt?: number;
}

interface Props {
  item: VodItem;
  /** Épisode suivant (séries) : enchaîné automatiquement en fin de lecture. */
  next?: VodItem | null;
  onPlayNext?: () => void;
  onExit: () => void;
}

/** Palier d'avance rapide selon le nombre d'appuis rapprochés : 10 s, puis 30 s, 60 s, 120 s. */
const stepFor = (n: number) => (n < 3 ? 10 : n < 8 ? 30 : n < 15 ? 60 : 120);

export function VodPlayer({ item, next, onPlayNext, onExit }: Props) {
  const p = usePlayer();
  const [overlay, setOverlay] = useState(true);
  const [tracks, setTracks] = useState(false);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const hideTimer = useRef(0);
  const seek = useRef({ timer: 0, presses: 0, last: 0 });

  /* ------------------------------------------------------ Chargement */

  useEffect(() => {
    setLoadError(null);
    setCountdown(null);
    player.setView({ mode: 'full' });
    api
      .play(item.kind, item.id)
      .then((r) => player.load({ url: r.url, type: r.type, live: false, startAt: item.startAt || undefined }))
      .catch((e: ApiError) => setLoadError(e.message || 'Lecture impossible.'));
    show();
    // Horloge de la barre de progression.
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(seek.current.timer);
    };
  }, [item.kind, item.id]);

  /* ---------------------------------------------- Sauvegarde position */

  const save = () => {
    const pos = player.position();
    const dur = player.duration();
    if (!dur || pos < 5) return;
    saveLocal(item.kind, item.id, pos, dur);
    api.saveProgress(item.kind, item.id, pos, dur).catch(() => undefined);
  };
  useEffect(() => {
    const t = window.setInterval(() => p.state === 'playing' && save(), SAVE_EVERY_MS);
    return () => {
      window.clearInterval(t);
      save();
    };
  }, [item.kind, item.id, p.state]);

  // Déclaré APRÈS la sauvegarde : au démontage, la position est enregistrée avant l'arrêt du flux.
  useEffect(() => () => player.stop(), []);

  /* ------------------------------------------------ Fin de lecture */

  useEffect(() => {
    if (p.state !== 'ended') return;
    const dur = player.duration();
    if (dur) api.saveProgress(item.kind, item.id, dur, dur).catch(() => undefined);
    if (next && onPlayNext) setCountdown(NEXT_COUNTDOWN);
    else onExit();
  }, [p.state]);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown <= 0) {
      onPlayNext && onPlayNext();
      return undefined;
    }
    const t = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  /* ------------------------------------------------------- Touches */

  const show = () => {
    setOverlay(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOverlay(false), OVERLAY_MS);
  };

  const nudge = (dir: 1 | -1) => {
    const s = seek.current;
    const now = Date.now();
    s.presses = now - s.last < 900 ? s.presses + 1 : 0;
    s.last = now;
    const base = seekTarget !== null ? seekTarget : player.position();
    const dur = player.duration() || Infinity;
    const target = Math.max(0, Math.min(dur - 2, base + dir * stepFor(s.presses)));
    setSeekTarget(target);
    show();
    window.clearTimeout(s.timer);
    s.timer = window.setTimeout(() => {
      player.seekTo(target);
      setSeekTarget(null);
    }, SEEK_COMMIT_MS);
  };

  useKeyHandler((k) => {
    if (tracks) return false;
    if (countdown !== null) {
      if (k.action === 'back') {
        setCountdown(null);
        onExit();
        return true;
      }
      return false; // boutons « Lire maintenant » / « Annuler »
    }
    switch (k.action) {
      case 'back':
        onExit();
        return true;
      case 'right':
      case 'ff':
        nudge(1);
        return true;
      case 'left':
      case 'rw':
        nudge(-1);
        return true;
      case 'ok':
      case 'playPause':
      case 'play':
      case 'pause':
        if (p.state === 'error' || loadError) return false;
        p.toggle();
        show();
        return true;
      case 'yellow':
        setTracks(true);
        return true;
      default:
        show();
        return p.state !== 'error';
    }
  });

  const pos = seekTarget !== null ? seekTarget : player.position();
  const dur = player.duration();
  const loading = p.state === 'loading' || p.state === 'buffering';
  const error = loadError || (p.state === 'error' && p.error ? p.error.message : null);

  return (
    <FocusLayer name="vod-player">
      <div class="player-ui">
        {loading && <div class="spinner spinner-corner" aria-label="Chargement" />}
        {loading && p.reconnect && <div class="osd-reconnect">Reconnexion ({p.reconnect.attempt}/{p.reconnect.max})…</div>}

        {error && (
          <div class="player-error">
            <h2>{item.title}</h2>
            <p>{error}</p>
            <div class="row-actions center">
              <Button id="vod-retry" variant="primary" autoFocus onSelect={() => (loadError ? onExit() : p.retry())}>
                {loadError ? 'Retour' : 'Réessayer'}
              </Button>
            </div>
          </div>
        )}

        {countdown !== null && next && (
          <div class="next-panel">
            <p class="eyebrow">Épisode suivant dans {countdown} s</p>
            <h2>{next.title}</h2>
            {next.subtitle && <p class="hero-sub">{next.subtitle}</p>}
            <div class="row-actions">
              <Button id="next-now" variant="primary" autoFocus onSelect={() => onPlayNext && onPlayNext()}>
                Lire maintenant
              </Button>
              <Button id="next-cancel" onSelect={onExit}>
                Retour
              </Button>
            </div>
          </div>
        )}

        <div class={'player-bar vod-bar' + (overlay || loading || p.state === 'paused' || seekTarget !== null ? ' is-visible' : '')}>
          <div class="player-info">
            <div class="player-title">{item.title}</div>
            {item.subtitle && <div class="player-sub">{item.subtitle}</div>}
            <div class="vod-progress">
              <span class="vod-time">{clock(pos)}</span>
              <ProgressBar value={dur ? pos / dur : 0} />
              <span class="vod-time">{dur ? clock(dur) : '--:--'}</span>
            </div>
          </div>
          <div class="player-side">
            <div class="player-clock">{p.state === 'paused' ? '❚❚' : '▶'}</div>
            <div class="player-hints">
              <span class="key-chip">◀ ▶</span> Avance rapide
              <span class="dot dot-yellow" /> Pistes
            </div>
          </div>
        </div>
      </div>
      {tracks && <TracksDialog onClose={() => setTracks(false)} />}
    </FocusLayer>
  );
}
