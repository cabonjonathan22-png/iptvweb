import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { TvCategory, TvChannel } from '@iptv/shared';
import { useApp } from '../app-context';
import { api, ApiError } from '../lib/api';
import { prefs } from '../lib/prefs';
import { ScreenHeader } from '../components/ScreenHeader';
import { VirtualList } from '../components/VirtualList';
import { Img } from '../components/Img';
import { Button } from '../components/Button';
import { player } from '../player/engine';
import { usePlayer } from '../player/usePlayer';
import { FullPlayer } from '../player/FullPlayer';
import { ChannelSource } from './live/channel-source';
import { focus } from '../nav/focus';

/* Géométrie (base 1080p) : partagée entre le CSS et le placement de la vidéo. */
const TOP = 182;
const LIST_H = 844;
const CAT_ROW = 76;
const CH_ROW = 100;
const PREVIEW = { x: 1188, y: TOP, w: 636, h: 358 };
const PREVIEW_DELAY_MS = 800;
const CAT_DEBOUNCE_MS = 250;

/** Position mémorisée entre deux visites de l'écran (même session). */
const memory = { cat: 0, channel: {} as { [cat: string]: number } };

export function LiveScreen() {
  const app = useApp();
  const p = usePlayer();
  const [cats, setCats] = useState<TvCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catIdx, setCatIdx] = useState(memory.cat);
  const [loadedCat, setLoadedCat] = useState(memory.cat);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [chIdx, setChIdx] = useState(0);
  const [focusCol, setFocusCol] = useState<'cats' | 'channels'>('channels');
  const [full, setFull] = useState(false);
  const [playing, setPlaying] = useState<TvChannel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const previous = useRef<TvChannel | null>(null);
  const noticeTimer = useRef(0);

  /* ---------------------------------------------------------- Données */

  const loadCats = () => {
    setError(null);
    api
      .liveCategories()
      .then(setCats)
      .catch((e: ApiError) => {
        if (e.status === 401) return;
        setError(e.status === 409 ? 'Aucune playlist n’est assignée à cette TV.' : e.message);
      });
  };
  useEffect(() => {
    loadCats();
    return () => player.stop();
  }, []);

  // Index 0 = « Toutes les chaînes ».
  const catKey = (i: number): number | 'all' => (i === 0 || !cats ? 'all' : cats[i - 1]!.id);

  // Changement de catégorie : chargement différé (on ne recharge pas à chaque ligne survolée).
  useEffect(() => {
    if (catIdx === loadedCat) return;
    const t = window.setTimeout(() => setLoadedCat(catIdx), CAT_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [catIdx]);

  const source = useMemo(() => (cats ? new ChannelSource(catKey(loadedCat), () => rerender(undefined)) : null), [cats, loadedCat]);
  useEffect(() => {
    if (!source) return undefined;
    memory.cat = loadedCat;
    setChIdx(memory.channel[String(source.category)] || 0);
    source.ensure(0);
    return () => source.dispose();
  }, [source]);

  useEffect(() => {
    if (source) {
      memory.channel[String(source.category)] = chIdx;
      source.ensureRange(chIdx - 10, chIdx + 10);
    }
  }, [chIdx, source]);

  const focused = source ? source.get(chIdx) : undefined;

  // Focus initial sur la liste des chaînes dès son premier affichage (les catégories arrivent avant).
  const initialFocusDone = useRef(false);
  useEffect(() => {
    if (!initialFocusDone.current && source && source.total > 0) {
      initialFocusDone.current = true;
      focus.focus('live-channels');
      setFocusCol('channels');
    }
  });

  /* --------------------------------------------------------- Lecture */

  const play = (ch: TvChannel, view: 'preview' | 'full') => {
    player.setView(view === 'full' ? { mode: 'full' } : { mode: 'preview', ...PREVIEW });
    if (playing && playing.id === ch.id && player.src) return;
    if (playing) previous.current = playing;
    setPlaying(ch);
    const mode = prefs.liveMode;
    api
      .play('live', ch.id, mode === 'auto' ? undefined : mode)
      .then((r) => player.load({ url: r.url, type: r.type, live: true }))
      .catch((e: ApiError) => {
        if (e.status !== 401) flash(e.message || 'Lecture impossible.');
      });
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
  };

  // Aperçu automatique après 800 ms de focus sur une chaîne.
  useEffect(() => {
    if (full || focusCol !== 'channels' || !focused || !prefs.preview) return undefined;
    if (playing && playing.id === focused.id) {
      player.setView({ mode: 'preview', ...PREVIEW });
      return undefined;
    }
    const t = window.setTimeout(() => play(focused, 'preview'), PREVIEW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [focused && focused.id, focusCol, full]);

  const openFull = (ch: TvChannel) => {
    setFull(true);
    play(ch, 'full');
  };

  const exitFull = () => {
    setFull(false);
    if (prefs.preview) player.setView({ mode: 'preview', ...PREVIEW });
    else {
      player.stop();
      setPlaying(null);
    }
  };

  const zap = (delta: 1 | -1) => {
    if (!source || source.total <= 0) return;
    const i = (chIdx + delta + source.total) % source.total;
    setChIdx(i);
    source.at(i).then((ch) => ch && play(ch, 'full'));
  };

  const byNumber = (n: number) => {
    api
      .liveChannelByNum(n)
      .then((r) => (r.channel ? play(r.channel, 'full') : flash('Aucune chaîne n°' + n)))
      .catch(() => flash('Aucune chaîne n°' + n));
  };

  /* ------------------------------------------------------------ Rendu */

  if (error) {
    return (
      <div class="screen">
        <ScreenHeader title="TV en direct" backHint="Accueil" />
        <div class="hero">
          <h1 class="hero-title">TV en direct indisponible</h1>
          <p class="hero-sub">{error}</p>
          <div class="row-actions">
            <Button id="live-retry" variant="primary" autoFocus onSelect={loadCats}>
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const catCount = cats ? cats.length + 1 : 0;
  const total = source ? Math.max(0, source.total) : 0;

  return (
    <div class={'screen live' + (full ? ' is-full' : '')}>
      <div class="live-chrome">
        <ScreenHeader title="TV en direct" backHint="Accueil" />
        <div class="live-cols">
          <div class="col-cats">
            {cats ? (
              <VirtualList
                id="live-cats"
                count={catCount}
                rowHeight={CAT_ROW}
                height={LIST_H}
                index={catIdx}
                onIndex={setCatIdx}
                onFocusChange={() => setFocusCol('cats')}
                onSelect={() => setLoadedCat(catIdx)}
                renderRow={(i) => {
                  const c = i === 0 ? null : cats[i - 1]!;
                  return (
                    <div class="cat-row">
                      <span class="cat-name">{c ? c.name : 'Toutes les chaînes'}</span>
                      {c && c.locked && <span class="cat-lock">🔒</span>}
                      {c && <span class="cat-count">{c.count}</span>}
                    </div>
                  );
                }}
              />
            ) : (
              <SkeletonRows n={9} h={CAT_ROW} />
            )}
          </div>

          <div class="col-channels">
            {source && source.total === 0 ? (
              <p class="empty">Aucune chaîne dans cette catégorie.</p>
            ) : source && source.total > 0 ? (
              <VirtualList
                id="live-channels"
                autoFocus
                count={total}
                rowHeight={CH_ROW}
                height={LIST_H}
                index={chIdx}
                onIndex={setChIdx}
                onFocusChange={() => setFocusCol('channels')}
                onSelect={(i) => {
                  const ch = source.get(i);
                  if (ch) openFull(ch);
                }}
                renderRow={(i, isFocused) => {
                  const ch = source.get(i);
                  if (!ch) return <div class="ch-row skeleton" />;
                  return (
                    <div class={'ch-row' + (playing && playing.id === ch.id ? ' is-playing' : '')}>
                      <span class="ch-num">{ch.num !== null ? ch.num : ''}</span>
                      <Img key={ch.logo || ch.id} src={ch.logo} name={ch.name} class="ch-logo" />
                      <span class="ch-name">{ch.name}</span>
                      {playing && playing.id === ch.id && !isFocused && <span class="ch-live">●</span>}
                    </div>
                  );
                }}
              />
            ) : (
              <SkeletonRows n={8} h={CH_ROW} />
            )}
            {source && source.error && source.total < 0 && <p class="empty error-text">{source.error}</p>}
          </div>

          <div class="col-preview">
            <div class="preview-box" style={{ width: PREVIEW.w + 'px', height: PREVIEW.h + 'px' }}>
              {!playing || player.view.mode !== 'preview' ? (
                <div class="preview-placeholder">
                  {focused ? <Img key={'p' + focused.id} src={focused.logo} name={focused.name} class="preview-logo" /> : null}
                  {!prefs.preview && <span class="small">Appuyez sur OK pour regarder</span>}
                </div>
              ) : p.state === 'error' && p.error ? (
                <div class="preview-placeholder">
                  <span class="small error-text">{p.error.message}</span>
                </div>
              ) : p.state === 'loading' || p.state === 'buffering' ? (
                <>
                  <div class="spinner" />
                  {p.reconnect && (
                    <span class="preview-reconnect small">
                      Reconnexion ({p.reconnect.attempt}/{p.reconnect.max})…
                    </span>
                  )}
                </>
              ) : null}
            </div>
            {focused && (
              <div class="preview-info">
                <div class="preview-title">
                  {focused.num !== null && <span class="player-num">{focused.num}</span>}
                  {focused.name}
                </div>
                <p class="small">Guide TV : bientôt disponible.</p>
                <p class="hint preview-hint">
                  <span class="key-chip">OK</span>Plein écran
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {full && playing && (
        <FullPlayer
          channel={playing}
          notice={notice}
          onZap={zap}
          onNumber={byNumber}
          onLast={() => previous.current && play(previous.current, 'full')}
          onExit={exitFull}
        />
      )}
      {!full && notice && <div class="osd-notice">{notice}</div>}
    </div>
  );
}

function SkeletonRows({ n, h }: { n: number; h: number }) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(<div key={i} class="skeleton-row skeleton" style={{ height: h - 12 + 'px' }} />);
  return <div>{rows}</div>;
}
