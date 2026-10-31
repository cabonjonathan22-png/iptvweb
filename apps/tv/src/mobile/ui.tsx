import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { TvChannel } from '@iptv/shared';
import { api, API_URL, ApiError } from '../lib/api';
import { epgFor, progressOf } from '../lib/epg-store';
import { hhmm } from '../lib/format';
import { setUnlock } from '../lib/session';
import { Img } from '../components/Img';
import { goBack, pushBack } from './nav';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  live: 'M3 7h18v12H3zM8 3l4 4 4-4',
  movies: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  series: 'M7 7h13v13H7zM4 4h13M4 4v13',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',
  back: 'M15 5l-7 7 7 7',
};

export function Icon({ name, size = 24 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Header({ title, back, children }: { title: string; back?: boolean; children?: ComponentChildren }) {
  return (
    <header class="m-header">
      {back && (
        <button class="m-icon-btn" aria-label="Retour" onClick={goBack}>
          <Icon name="back" />
        </button>
      )}
      <h1 class="m-title">{title}</h1>
      {children}
    </header>
  );
}

export const Spinner = () => <div class="m-spinner" role="status" aria-label="Chargement" />;

/** Message d'erreur commun ; 409 : aucune playlist sur cet appareil. */
export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (error.status === 409) {
    return (
      <div class="m-empty">
        <h2>Aucune playlist</h2>
        <p>Ajoutez une playlist depuis le dashboard, puis assignez-la à cet appareil.</p>
        <a class="m-btn m-btn-primary" href={API_URL + '/playlists'} target="_blank" rel="noopener">
          Ouvrir le dashboard
        </a>
        {onRetry && (
          <button class="m-btn" onClick={onRetry}>
            Actualiser
          </button>
        )}
      </div>
    );
  }
  return (
    <div class="m-empty">
      <p>{error.message || 'Connexion impossible au serveur.'}</p>
      {onRetry && (
        <button class="m-btn m-btn-primary" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}

/** Panneau remontant du bas ; le retour système le ferme. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => pushBack(onClose), []);
  return (
    <div class="m-sheet-wrap" onClick={onClose}>
      <div class="m-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="m-sheet-head">
          <h2>{title}</h2>
          <button class="m-link" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div class="m-sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Code parental : le clavier numérique du téléphone, validation au 4e chiffre. */
export function PinSheet({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = (v: string) => {
    const code = v.replace(/\D/g, '').slice(0, 4);
    setPin(code);
    setError(null);
    if (code.length < 4) return;
    api
      .unlockParental(code)
      .then((r) => {
        setUnlock(r.token);
        onUnlocked();
      })
      .catch((e: ApiError) => {
        setPin('');
        setError(e.message || 'Code incorrect.');
      });
  };
  return (
    <Sheet title="Code parental" onClose={onClose}>
      <p class="m-muted">Ce contenu est protégé. Saisissez le code à 4 chiffres.</p>
      <PinInput value={pin} onInput={input} />
      {error && <p class="m-error">{error}</p>}
    </Sheet>
  );
}

export function PinInput({ value, onInput }: { value: string; onInput: (v: string) => void }) {
  return (
    <input
      class="m-pin"
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      autoFocus
      aria-label="Code à 4 chiffres"
      maxLength={4}
      value={value}
      onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
    />
  );
}

/**
 * Liste ou grille très longue à défilement natif : seules les lignes visibles
 * existent. Avec `minCell`, autant de colonnes que la largeur en permet, et la
 * hauteur de ligne suit la largeur de cellule (rotation, tablette).
 */
export function Windowed({
  count,
  rowHeight,
  minCell,
  onRange,
  render,
}: {
  count: number;
  rowHeight: (cellWidth: number) => number;
  minCell?: number;
  onRange?: (from: number, to: number) => void;
  render: (i: number) => ComponentChildren;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [top, setTop] = useState(0);
  const raf = useRef(0);

  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.cancelAnimationFrame(raf.current);
    };
  }, []);

  const cols = minCell && size.w ? Math.max(2, Math.floor(size.w / minCell)) : 1;
  const cell = size.w / cols;
  const rowH = rowHeight(cell) || 1;
  const rows = Math.ceil(count / cols);
  const first = Math.max(0, Math.floor(top / rowH) - 3);
  const last = Math.min(rows, Math.ceil((top + size.h) / rowH) + 3);
  const from = first * cols;
  const to = Math.min(count, last * cols);

  useEffect(() => {
    if (size.w && onRange) onRange(from, to);
  }, [from, to, size.w, count]);

  const items = [];
  for (let i = from; i < to; i++) {
    items.push(
      <div
        key={i}
        class="m-win-item"
        style={{
          width: cell + 'px',
          height: rowH + 'px',
          transform: 'translate(' + (i % cols) * cell + 'px,' + Math.floor(i / cols) * rowH + 'px)',
        }}
      >
        {render(i)}
      </div>,
    );
  }
  return (
    <div
      ref={box}
      class="m-fill m-scroll"
      onScroll={(e) => {
        const y = (e.currentTarget as HTMLElement).scrollTop;
        window.cancelAnimationFrame(raf.current);
        raf.current = window.requestAnimationFrame(() => setTop(y));
      }}
    >
      <div class="m-win" style={{ height: rows * rowH + 'px' }}>
        {size.w > 0 && items}
      </div>
    </div>
  );
}

export function ChannelRow({
  channel,
  active,
  favorite,
  onPlay,
  onFavorite,
}: {
  channel: TvChannel | undefined;
  active?: boolean;
  favorite?: boolean;
  onPlay?: () => void;
  onFavorite?: () => void;
}) {
  if (!channel) return <div class="m-ch m-skeleton" />;
  const epg = epgFor(channel.epgId);
  const now = epg && epg.now;
  return (
    <div class={'m-ch' + (active ? ' is-active' : '')}>
      <button class="m-ch-main" onClick={onPlay}>
        <Img key={channel.logo || channel.id} src={channel.logo} name={channel.name} class="m-ch-logo" />
        <span class="m-ch-text">
          <span class="m-ch-name">
            {channel.num !== null && <span class="m-ch-num">{channel.num}</span>}
            {channel.name}
          </span>
          {now && (
            <span class="m-ch-epg">
              {hhmm(now.start)} · {now.title}
            </span>
          )}
          {now && (
            <span class="m-bar">
              <i style={{ width: progressOf(now) * 100 + '%' }} />
            </span>
          )}
        </span>
      </button>
      {onFavorite && (
        <button class={'m-fav' + (favorite ? ' is-on' : '')} aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={!!favorite} onClick={onFavorite}>
          {favorite ? '♥' : '♡'}
        </button>
      )}
    </div>
  );
}

export function PosterTile({
  name,
  image,
  meta,
  progress,
  onOpen,
}: {
  name: string;
  image: string | null;
  meta?: string | null;
  progress?: number;
  onOpen: () => void;
}) {
  return (
    <button class="m-poster" onClick={onOpen}>
      <span class="m-poster-img">
        <Img key={image || name} src={image} name={name} class="m-img-fill" />
        {progress !== undefined && (
          <span class="m-bar m-poster-bar">
            <i style={{ width: progress * 100 + '%' }} />
          </span>
        )}
      </span>
      <span class="m-poster-name">{name}</span>
      {meta && <span class="m-poster-meta">{meta}</span>}
    </button>
  );
}

export const posterMeta = (p: { year: number | null; rating: number | null }) =>
  [p.year, p.rating ? '★ ' + p.rating : null].filter(Boolean).join(' · ') || null;

export function Row({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="m-row">
      <h2 class="m-row-title">{title}</h2>
      <div class="m-row-scroll">{children}</div>
    </section>
  );
}
