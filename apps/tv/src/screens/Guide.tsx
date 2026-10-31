import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { VNode } from 'preact';
import type { EpgGridRow, EpgProgram } from '@iptv/shared';
import { useApp } from '../app-context';
import { api, ApiError } from '../lib/api';
import { hhmm } from '../lib/format';
import { sendKey, useFocusable } from '../nav/hooks';
import { ScrollArrows } from '../components/ScrollArrows';
import { ScreenHeader } from '../components/ScreenHeader';
import { Img } from '../components/Img';
import { VodPlayer, type VodItem } from '../player/VodPlayer';

/* Géométrie (base 1080p). */
const CH_W = 340;
const TL_W = 1388;
const SPAN_MS = 2 * 3600_000;
const PX_PER_MS = TL_W / SPAN_MS;
const ROW_H = 96;
const VISIBLE = 6;
const STEP_MS = 30 * 60_000;
const PAGE = 30;

/** Le guide remonte aussi loin que l'EPG conservé par le serveur. */
const HISTORY_MS = 24 * 3600_000;

const floor30 = (t: number) => Math.floor(t / STEP_MS) * STEP_MS;

/**
 * Guide TV : grille temporelle virtualisée. Seules les ~6 rangées visibles
 * sont rendues ; les programmes sont chargés par pages de 30 chaînes et par
 * fenêtres de 2 h. Haut/bas : chaînes ; gauche/droite : programmes (la grille
 * se décale par pas de 30 min) ; OK : regarder la chaîne, ou le replay d'un
 * programme terminé si la chaîne le propose.
 */
export function GuideScreen() {
  const app = useApp();
  const [windowStart, setWindowStart] = useState(() => floor30(Date.now()));
  const [row, setRow] = useState(0);
  const [focusTime, setFocusTime] = useState(() => Date.now());
  const [total, setTotal] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState<VodItem | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const pages = useRef<{ [key: string]: EpgGridRow[] | 'loading' }>({});

  const keyOf = (page: number) => page + '@' + windowStart;
  const ensure = (page: number) => {
    const k = keyOf(page);
    if (pages.current[k]) return;
    pages.current[k] = 'loading';
    api
      .epgGrid('all', page * PAGE, PAGE, windowStart, windowStart + SPAN_MS)
      .then((r) => {
        pages.current[k] = r.rows;
        setTotal(r.total);
        rerender(undefined);
      })
      .catch((e: ApiError) => {
        delete pages.current[k];
        if (e.status !== 401) setError(e.message);
      });
  };
  const rowAt = (i: number): EpgGridRow | undefined => {
    const p = pages.current[keyOf(Math.floor(i / PAGE))];
    return p && p !== 'loading' ? p[i % PAGE] : undefined;
  };

  const first = Math.max(0, Math.min(row - 2, (total > 0 ? total : 0) - VISIBLE));
  useEffect(() => {
    ensure(Math.floor(first / PAGE));
    ensure(Math.floor((first + VISIBLE) / PAGE));
  });

  const current = rowAt(row);
  const programs = current ? current.programs : [];
  const focusedProg = useMemo(
    () => programs.find((p) => p.start <= focusTime && p.stop > focusTime) || null,
    [current, focusTime],
  );

  const moveTime = (t: number) => {
    const min = floor30(Date.now() - HISTORY_MS);
    const max = Date.now() + 22 * 3600_000;
    const next = Math.max(min, Math.min(max, t));
    setFocusTime(next);
    if (next < windowStart) setWindowStart(floor30(next));
    else if (next >= windowStart + SPAN_MS) setWindowStart(floor30(next) - SPAN_MS + STEP_MS);
  };

  const { ref, focused } = useFocusable<HTMLDivElement>({
    id: 'guide-grid',
    autoFocus: true,
    onSelect: () => {
      if (!current) return;
      if (focusedProg && current.channel.catchup && focusedProg.stop <= Date.now()) {
        setReplay({
          kind: 'catchup',
          id: current.channel.id,
          title: focusedProg.title,
          subtitle: current.channel.name + ' · ' + hhmm(focusedProg.start),
          window: { start: focusedProg.start, stop: focusedProg.stop },
        });
      } else app.push('live', { play: current.channel, returnOnExit: true });
    },
    onArrow: (dir) => {
      if (dir === 'up' || dir === 'down') {
        const n = row + (dir === 'down' ? 1 : -1);
        if (n >= 0 && (total < 0 || n < total)) setRow(n);
        return true;
      }
      if (dir === 'right') moveTime(focusedProg ? focusedProg.stop + 1 : focusTime + STEP_MS);
      else {
        const prev = focusedProg ? programs[programs.indexOf(focusedProg) - 1] : null;
        moveTime(focusedProg ? (prev ? prev.start : focusedProg.start - STEP_MS) : focusTime - STEP_MS);
      }
      return true;
    },
  });

  const slots: VNode[] = [];
  for (let i = 0; i < 4; i++) {
    const t = windowStart + i * STEP_MS;
    slots.push(
      <span key={t} class="ruler-slot" style={{ left: (t - windowStart) * PX_PER_MS + 'px' }}>
        {hhmm(t)}
      </span>,
    );
  }
  const now = Date.now();
  const nowX = (now - windowStart) * PX_PER_MS;

  const rows: VNode[] = [];
  for (let i = first; i < Math.min(first + VISIBLE, total > 0 ? total : VISIBLE); i++) {
    const r = rowAt(i);
    rows.push(
      <div key={i} class={'guide-row' + (i === row ? ' is-current' : '')} style={{ top: (i - first) * ROW_H + 'px' }}>
        <div class="guide-ch">
          {r ? (
            <>
              <span class="ch-num">{r.channel.num !== null ? r.channel.num : ''}</span>
              <Img key={r.channel.logo || r.channel.id} src={r.channel.logo} name={r.channel.name} class="guide-logo" />
              <span class="guide-ch-name">{r.channel.name}</span>
            </>
          ) : (
            <span class="skeleton guide-skel" />
          )}
        </div>
        <div class="guide-line">
          {r && r.programs.length === 0 && <div class="guide-prog empty-prog" style={{ left: '0px', width: TL_W - 8 + 'px' }}>Pas de programme</div>}
          {r &&
            r.programs.map((p) => {
              const x = Math.max(0, (p.start - windowStart) * PX_PER_MS);
              const w = Math.min(TL_W, (p.stop - windowStart) * PX_PER_MS) - x;
              if (w <= 2) return null;
              const isF = focused && i === row && focusedProg === p;
              return (
                <div key={p.start} class={'guide-prog' + (isF ? ' is-focused' : '') + (p.start <= now && p.stop > now ? ' is-now' : '') + (r.channel.catchup && p.stop <= now ? ' is-replay' : '')} style={{ left: x + 'px', width: w - 6 + 'px' }}>
                  <span class="guide-prog-title">{p.title}</span>
                  <span class="guide-prog-time">{hhmm(p.start)}</span>
                </div>
              );
            })}
        </div>
      </div>,
    );
  }

  return (
    <>
    {replay && <VodPlayer item={replay} onExit={() => setReplay(null)} />}
    <div class="screen guide" style={replay ? { visibility: 'hidden' } : undefined}>
      <ScreenHeader title="Guide TV" backHint="Accueil" />
      <div class="guide-info">
        {current && (
          <>
            <div class="guide-info-ch">
              {current.channel.num !== null && <span class="player-num">{current.channel.num}</span>}
              {current.channel.name}
            </div>
            <ProgramInfo p={focusedProg} />
            {focusedProg && current.channel.catchup && focusedProg.stop <= now && <p class="small guide-replay-hint">↺ Replay disponible : OK pour regarder</p>}
          </>
        )}
        {error && <p class="error-text">{error}</p>}
        {total === 0 && <p class="empty">Aucune chaîne.</p>}
      </div>
      <div class="guide-ruler" style={{ marginLeft: CH_W + 'px' }}>
        {slots}
      </div>
      <div ref={ref} class="guide-grid" style={{ height: VISIBLE * ROW_H + 'px' }}>
        {nowX > 0 && nowX < TL_W && <div class="guide-now" style={{ left: CH_W + nowX + 'px' }} />}
        {rows}
        <ScrollArrows dirs={['up', 'down', 'left', 'right']} onStep={sendKey} />
      </div>
    </div>
    </>
  );
}

function ProgramInfo({ p }: { p: EpgProgram | null }) {
  if (!p) return <p class="small">Pas d'information de programme.</p>;
  return (
    <div>
      <div class="guide-info-title">
        {p.title} <span class="small">{hhmm(p.start)} – {hhmm(p.stop)}</span>
      </div>
      {p.desc && <p class="guide-info-desc">{p.desc}</p>}
    </div>
  );
}
