import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { EpgProgram, RemoteCommand, TvChannel } from '@iptv/shared';
import { api, ApiError } from '../lib/api';
import { isIOS } from '../lib/device';
import { epgFor, onEpgChange, progressOf } from '../lib/epg-store';
import { clock, hhmm } from '../lib/format';
import { saveLocal } from '../lib/local-progress';
import { PagedSource } from '../lib/paged-source';
import { prefs } from '../lib/prefs';
import { player } from '../player/engine';
import { usePlayer } from '../player/usePlayer';
import { goBack, pushBack } from './nav';
import { initCast } from '../player/cast';
import { CastSheet } from './Remote';
import { ChannelRow, Icon, PinSheet, Sheet, Spinner, Windowed } from './ui';

const OVERLAY_MS = 4000;
const SAVE_EVERY_MS = 10_000;
const DOUBLE_TAP_MS = 300;
const NEXT_COUNTDOWN = 10;

function isFullscreen() {
  const d = document as Document & { webkitFullscreenElement?: Element };
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

/** Plein écran : paysage quand le téléphone l'autorise ; l'iPhone n'a que le lecteur natif. */
function toggleFull() {
  const d = document as Document & { webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (isFullscreen()) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => undefined);
    else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
    return;
  }
  const request = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
  if (request) {
    request
      .then(() => {
        if (orientation && orientation.lock) return orientation.lock('landscape');
        return undefined;
      })
      .catch(() => undefined);
    return;
  }
  const v = player.video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
  if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
}

/** Vidéo à l'écran le temps du composant, et suivi du plein écran. */
function useVideoStage() {
  useEffect(() => {
    player.setView({ mode: 'full' });
    const root = document.documentElement;
    const onChange = () => {
      root.classList.toggle('m-full', isFullscreen());
      if (!isFullscreen() && screen.orientation && screen.orientation.unlock) {
        try {
          screen.orientation.unlock();
        } catch (_) {
          /* non pris en charge */
        }
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      if (isFullscreen()) toggleFull();
      root.classList.remove('m-full');
      player.stop();
      player.setView({ mode: 'hidden' });
    };
  }, []);
}

/** Commandes visibles quelques secondes après chaque contact. */
function useOverlay() {
  const [visible, setVisible] = useState(true);
  const timer = useRef(0);
  const show = () => {
    setVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), OVERLAY_MS);
  };
  useEffect(() => {
    show();
    return () => window.clearTimeout(timer.current);
  }, []);
  const toggle = () => {
    if (visible) {
      window.clearTimeout(timer.current);
      setVisible(false);
    } else show();
  };
  return { visible, show, toggle };
}

function Tracks({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const audio = p.audioTracks();
  const subs = p.subtitleTracks();
  return (
    <Sheet title="Pistes" onClose={onClose}>
      <p class="m-label">Audio</p>
      {audio.length ? (
        <div class="m-chips">
          {audio.map((t) => (
            <button key={t.id} class={'m-chip' + (t.active ? ' is-on' : '')} onClick={() => p.setAudioTrack(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      ) : (
        <p class="m-muted">Une seule piste audio.</p>
      )}
      <p class="m-label">Sous-titres</p>
      <div class="m-chips">
        <button class={'m-chip' + (subs.some((t) => t.active) ? '' : ' is-on')} onClick={() => p.setSubtitleTrack(-1)}>
          Désactivés
        </button>
        {subs.map((t) => (
          <button key={t.id} class={'m-chip' + (t.active ? ' is-on' : '')} onClick={() => p.setSubtitleTrack(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- Direct */

export function LivePlayer({ channel, source: given, index }: { channel: TvChannel; source?: PagedSource<TvChannel>; index?: number }) {
  useVideoStage();
  const p = usePlayer();
  const overlay = useOverlay();
  const [cast, setCast] = useState(false);
  const [replayList, setReplayList] = useState(false);
  const [replay, setReplay] = useState<VodPlayback | null>(null);
  const started = useRef(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [current, setCurrent] = useState(channel);
  const [idx, setIdx] = useState(index === undefined ? -1 : index);
  const [favorite, setFavorite] = useState(false);
  const [tracks, setTracks] = useState(false);
  const [pin, setPin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Lancée depuis l'accueil ou la recherche : la liste proposée est celle de toutes les chaînes.
  const source = useMemo(
    () => given || new PagedSource<TvChannel>('all', (o, l) => api.liveChannels('all', o, l), () => rerender(undefined)),
    [given],
  );

  const load = (ch: TvChannel) => {
    setNotice(null);
    api.saveProgress('live', ch.id, 0, null).catch(() => undefined);
    const mode = prefs.liveMode;
    // Sans MSE, l'iPhone ne sait lire que le HLS.
    const asked = mode === 'auto' ? (isIOS ? 'hls' : undefined) : mode;
    api
      .play('live', ch.id, asked)
      .then((r) => player.load({ url: r.url, type: r.type, live: true }))
      .catch((e: ApiError) => {
        if (e.code === 'locked') setPin(true);
        else if (e.status !== 401) setNotice(e.message || 'Lecture impossible.');
      });
  };

  const open = (ch: TvChannel, i: number) => {
    setCurrent(ch);
    setIdx(i);
    overlay.show();
    load(ch);
  };

  const zap = (delta: 1 | -1) => {
    if (idx < 0 || source.total <= 0) return;
    const i = (idx + delta + source.total) % source.total;
    source.at(i).then((ch) => ch && open(ch, i));
  };

  useEffect(() => {
    load(channel);
    source.ensure(0);
    api
      .liveChannels('fav', 0, 200)
      .then((r) => setFavorite(r.items.some((c) => c.id === channel.id)))
      .catch(() => undefined);
    initCast();
    const off = onEpgChange(() => rerender(undefined));
    return off;
  }, []);

  // Le replay partage la vidéo : à sa sortie, on revient au direct.
  useEffect(() => {
    if (replay) return pushBack(() => setReplay(null));
    if (started.current) {
      player.setView({ mode: 'full' });
      load(current);
    }
    started.current = true;
    return undefined;
  }, [!!replay]);

  const toggleFav = () => {
    const on = !favorite;
    setFavorite(on);
    api.setFavorite('live', current.id, on).catch(() => setFavorite(!on));
  };

  const loading = p.state === 'loading' || p.state === 'buffering';
  const epg = epgFor(current.epgId);
  const shown = overlay.visible || loading || p.state === 'paused' || p.state === 'error' || !!notice;

  if (replay) return <VodPlayer key={replay.window!.start} playback={replay} />;

  return (
    <div class="m-player">
      <div class={'m-stage' + (shown ? ' is-shown' : '') + (p.state === 'error' || notice ? ' has-msg' : '')} onClick={overlay.toggle}>
        {loading && <div class="m-spinner m-stage-spin" />}
        {p.state === 'error' && p.error && (
          <div class="m-stage-msg" onClick={(e) => e.stopPropagation()}>
            <p>{p.error.message}</p>
            <button class="m-btn m-btn-primary" onClick={() => p.retry()}>
              Réessayer
            </button>
          </div>
        )}
        {notice && <div class="m-stage-msg"><p>{notice}</p></div>}
        {loading && p.reconnect && <div class="m-stage-note">Reconnexion ({p.reconnect.attempt}/{p.reconnect.max})…</div>}
        <div class="m-controls">
          <div class="m-ctl-top" onClick={(e) => e.stopPropagation()}>
            <button class="m-ctl" aria-label="Retour" onClick={goBack}>
              <Icon name="back" />
            </button>
            <span class="m-ctl-title">{current.name}</span>
            <button class="m-ctl" aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={favorite} onClick={toggleFav}>
              {favorite ? '♥' : '♡'}
            </button>
            <button class="m-ctl m-ctl-text" onClick={() => setTracks(true)}>
              Pistes
            </button>
            <button class="m-ctl m-ctl-text" onClick={() => setCast(true)}>
              Diffuser
            </button>
          </div>
          <div class="m-ctl-mid" onClick={(e) => e.stopPropagation()}>
            {idx >= 0 && (
              <button class="m-ctl m-ctl-big" aria-label="Chaîne précédente" onClick={() => zap(-1)}>
                ⏮
              </button>
            )}
            <button class="m-ctl m-ctl-big m-ctl-main" aria-label={p.state === 'paused' ? 'Lecture' : 'Pause'} onClick={() => (p.toggle(), overlay.show())}>
              {p.state === 'paused' ? '▶' : '❚❚'}
            </button>
            {idx >= 0 && (
              <button class="m-ctl m-ctl-big" aria-label="Chaîne suivante" onClick={() => zap(1)}>
                ⏭
              </button>
            )}
          </div>
          <div class="m-ctl-bottom" onClick={(e) => e.stopPropagation()}>
            <span class="m-live-dot">EN DIRECT</span>
            {current.catchup && (
              <button class="m-ctl m-ctl-text" onClick={() => setReplayList(true)}>
                Replay
              </button>
            )}
            <button class="m-ctl m-ctl-text" onClick={toggleFull}>
              Plein écran
            </button>
          </div>
        </div>
      </div>

      <div class="m-below">
        <div class="m-now">
          <h1>{current.name}</h1>
          {epg && epg.now ? (
            <>
              <p>
                {hhmm(epg.now.start)} – {hhmm(epg.now.stop)} · {epg.now.title}
              </p>
              <span class="m-bar">
                <i style={{ width: progressOf(epg.now) * 100 + '%' }} />
              </span>
              {epg.next && <p class="m-muted">Ensuite {hhmm(epg.next.start)} · {epg.next.title}</p>}
            </>
          ) : (
            <p class="m-muted">Programme indisponible</p>
          )}
        </div>
        {source.total > 0 && (
          <Windowed
            count={source.total}
            rowHeight={() => 68}
            onRange={(a, b) => {
              source.ensureRange(a, b);
              epgIds(source, a, b);
            }}
            render={(i) => {
              const ch = source.get(i);
              return <ChannelRow channel={ch} active={!!ch && ch.id === current.id} onPlay={() => ch && open(ch, i)} />;
            }}
          />
        )}
      </div>

      {tracks && <Tracks onClose={() => setTracks(false)} />}
      {cast && (
        <CastSheet
          onClose={() => setCast(false)}
          title={current.name}
          command={() => ({ type: 'live', channel: current })}
          source={() => api.play('live', current.id, 'hls')}
        />
      )}
      {replayList && (
        <ReplaySheet
          channel={current}
          onClose={() => setReplayList(false)}
          onPick={(pb) => {
            setReplayList(false);
            setReplay(pb);
          }}
        />
      )}
      {pin && (
        <PinSheet
          onClose={() => setPin(false)}
          onUnlocked={() => {
            setPin(false);
            load(current);
          }}
        />
      )}
    </div>
  );
}

/** Programmes des dernières 24 h (durée de conservation du guide), du plus récent au plus ancien. */
function ReplaySheet({ channel, onClose, onPick }: { channel: TvChannel; onClose: () => void; onPick: (p: VodPlayback) => void }) {
  const [list, setList] = useState<EpgProgram[] | null>(null);
  useEffect(() => {
    const now = Date.now();
    api
      .epgChannel(channel.id, now - 24 * 3600_000, now)
      .then((r) => setList(r.filter((x) => x.start < now).reverse()))
      .catch(() => setList([]));
  }, [channel.id]);
  return (
    <Sheet title="Replay" onClose={onClose}>
      {!list && <Spinner />}
      {list && !list.length && <p class="m-muted">Aucun programme connu pour cette chaîne.</p>}
      <div class="m-list">
        {list &&
          list.map((x) => (
            <button
              key={x.start}
              class="m-list-item"
              onClick={() =>
                onPick({ kind: 'catchup', id: channel.id, title: x.title, subtitle: channel.name + ' · ' + hhmm(x.start), window: { start: x.start, stop: x.stop } })
              }
            >
              <span>
                {dayLabel(x.start)}
                {hhmm(x.start)} · {x.title}
              </span>
              {x.stop > Date.now() && <span class="m-muted">en cours</span>}
            </button>
          ))}
      </div>
    </Sheet>
  );
}

const dayLabel = (t: number) => (new Date(t).getDate() === new Date().getDate() ? '' : 'Hier ');

/** Précharge le programme en cours des lignes visibles. */
function epgIds(source: PagedSource<TvChannel>, from: number, to: number) {
  source.loaded(from, to).forEach((c) => epgFor(c.epgId));
}

/* ------------------------------------------------------------ Film, série */

export interface VodPlayback {
  /** `catchup` : replay, `id` est la chaîne et `window` le programme. */
  kind: 'vod' | 'episode' | 'catchup';
  id: number;
  title: string;
  subtitle?: string | null;
  startAt?: number;
  window?: { start: number; stop: number };
  /** Série de l'épisode, pour l'ouvrir sur un autre appareil. */
  seriesId?: number;
  /** Épisodes suivants de la série, enchaînés en fin de lecture. */
  queue?: VodPlayback[];
}

export function VodPlayer({ playback }: { playback: VodPlayback }) {
  const p = usePlayer();
  const overlay = useOverlay();
  const [item, setItem] = useState(playback);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tracks, setTracks] = useState(false);
  const [cast, setCast] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const lastTap = useRef<{ at: number; side: number }>({ at: 0, side: 0 });
  const next = item.queue && item.queue[0];
  const source = (mode?: 'hls') =>
    item.kind === 'catchup' ? api.catchup(item.id, item.window!.start, item.window!.stop, mode) : api.play(item.kind, item.id);
  const remoteCommand = (): RemoteCommand =>
    item.kind === 'vod'
      ? { type: 'vod', id: item.id, startAt: player.position() }
      : { type: 'episode', id: item.id, seriesId: item.seriesId!, startAt: player.position() };

  useEffect(() => {
    setLoadError(null);
    setCountdown(null);
    source(isIOS ? 'hls' : undefined)
      .then((r) => player.load({ url: r.url, type: r.type, live: false, startAt: item.startAt || undefined }))
      .catch((e: ApiError) => setLoadError(e.message || 'Lecture impossible.'));
    overlay.show();
    const t = window.setInterval(() => tick(undefined), 1000);
    return () => window.clearInterval(t);
  }, [item.kind, item.id]);

  const save = () => {
    if (item.kind === 'catchup') return; // pas de reprise pour un replay
    const pos = player.position();
    const dur = player.duration();
    if (!dur || pos < 5) return;
    saveLocal(item.kind, item.id, pos, dur);
    api.saveProgress(item.kind, item.id, pos, dur).catch(() => undefined);
  };
  useEffect(() => {
    const t = window.setInterval(() => player.state === 'playing' && save(), SAVE_EVERY_MS);
    return () => {
      window.clearInterval(t);
      save();
    };
  }, [item.kind, item.id]);

  // Déclaré APRÈS la sauvegarde : au démontage, la position est enregistrée avant l'arrêt du flux.
  useVideoStage();

  useEffect(() => {
    if (p.state !== 'ended') return;
    const dur = player.duration();
    if (dur && item.kind !== 'catchup') api.saveProgress(item.kind, item.id, dur, dur).catch(() => undefined);
    if (next) setCountdown(NEXT_COUNTDOWN);
    else goBack();
  }, [p.state]);

  const playNext = () => {
    if (!next) return;
    setItem({ ...next, queue: item.queue!.slice(1) });
  };
  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown <= 0) {
      playNext();
      return undefined;
    }
    const t = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  // Double appui sur un côté de l'image : ±10 s, comme sur les apps vidéo.
  const onStageTap = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const side = e.clientX < el.clientWidth / 2 ? -1 : 1;
    const now = Date.now();
    if (now - lastTap.current.at < DOUBLE_TAP_MS && lastTap.current.side === side) {
      player.seekBy(side * 10);
      overlay.show();
      lastTap.current.at = 0;
      return;
    }
    lastTap.current = { at: now, side };
    overlay.toggle();
  };

  const dur = player.duration();
  const pos = drag !== null ? drag : player.position();
  const loading = p.state === 'loading' || p.state === 'buffering';
  const error = loadError || (p.state === 'error' && p.error ? p.error.message : null);
  const shown = overlay.visible || loading || p.state === 'paused' || !!error || countdown !== null || drag !== null;

  return (
    <div class="m-player">
      <div class={'m-stage' + (shown ? ' is-shown' : '') + (error || countdown !== null ? ' has-msg' : '')} onClick={onStageTap}>
        {loading && <div class="m-spinner m-stage-spin" />}
        {error && (
          <div class="m-stage-msg" onClick={(e) => e.stopPropagation()}>
            <p>{error}</p>
            <button class="m-btn m-btn-primary" onClick={() => (loadError ? goBack() : p.retry())}>
              {loadError ? 'Retour' : 'Réessayer'}
            </button>
          </div>
        )}
        {countdown !== null && next && (
          <div class="m-stage-msg" onClick={(e) => e.stopPropagation()}>
            <p class="m-muted">Épisode suivant dans {countdown} s</p>
            <p>{next.subtitle || next.title}</p>
            <div class="m-actions">
              <button class="m-btn m-btn-primary" onClick={playNext}>
                Lire maintenant
              </button>
              <button class="m-btn" onClick={goBack}>
                Retour
              </button>
            </div>
          </div>
        )}
        <div class="m-controls">
          <div class="m-ctl-top" onClick={(e) => e.stopPropagation()}>
            <button class="m-ctl" aria-label="Retour" onClick={goBack}>
              <Icon name="back" />
            </button>
            <span class="m-ctl-title">
              {item.title}
              {item.subtitle && <small>{item.subtitle}</small>}
            </span>
            <button class="m-ctl m-ctl-text" onClick={() => setTracks(true)}>
              Pistes
            </button>
            <button class="m-ctl m-ctl-text" onClick={() => setCast(true)}>
              Diffuser
            </button>
          </div>
          <div class="m-ctl-mid" onClick={(e) => e.stopPropagation()}>
            <button class="m-ctl m-ctl-big" aria-label="Reculer de 10 secondes" onClick={() => (player.seekBy(-10), overlay.show())}>
              −10
            </button>
            <button class="m-ctl m-ctl-big m-ctl-main" aria-label={p.state === 'paused' ? 'Lecture' : 'Pause'} onClick={() => (p.toggle(), overlay.show())}>
              {p.state === 'paused' ? '▶' : '❚❚'}
            </button>
            <button class="m-ctl m-ctl-big" aria-label="Avancer de 10 secondes" onClick={() => (player.seekBy(10), overlay.show())}>
              +10
            </button>
          </div>
          <div class="m-ctl-bottom" onClick={(e) => e.stopPropagation()}>
            <span class="m-time">{clock(pos)}</span>
            <input
              class="m-seek"
              type="range"
              aria-label="Position de lecture"
              min={0}
              max={dur || 0}
              step={1}
              value={pos}
              onInput={(e) => {
                setDrag(Number((e.currentTarget as HTMLInputElement).value));
                overlay.show();
              }}
              onChange={(e) => {
                player.seekTo(Number((e.currentTarget as HTMLInputElement).value));
                setDrag(null);
              }}
            />
            <span class="m-time">{dur ? clock(dur) : '--:--'}</span>
            <button class="m-ctl m-ctl-text" onClick={toggleFull}>
              Plein écran
            </button>
          </div>
        </div>
      </div>
      <div class="m-below m-below-vod">
        <div class="m-now">
          <h1>{item.title}</h1>
          {item.subtitle && <p>{item.subtitle}</p>}
          {next && <p class="m-muted">Ensuite : {next.subtitle || next.title}</p>}
        </div>
      </div>
      {tracks && <Tracks onClose={() => setTracks(false)} />}
      {cast && (
        <CastSheet
          onClose={() => setCast(false)}
          title={item.title}
          command={item.kind === 'catchup' ? undefined : remoteCommand}
          source={() => source('hls')}
          startAt={() => player.position()}
        />
      )}
    </div>
  );
}
