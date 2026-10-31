import { useEffect, useMemo, useReducer, useState } from 'preact/hooks';
import type { PosterCard, TvCategory } from '@iptv/shared';
import { useApp } from '../app-context';
import { api, ApiError } from '../lib/api';
import { needsPin } from '../lib/session';
import { PagedSource } from '../lib/paged-source';
import { ScreenHeader } from '../components/ScreenHeader';
import { VirtualList } from '../components/VirtualList';
import { VirtualGrid } from '../components/VirtualGrid';
import { PosterTile } from '../components/Cards';
import { PinDialog } from '../components/PinDialog';
import { Button } from '../components/Button';
import { focus } from '../nav/focus';
import { useRef } from 'preact/hooks';

const COLS = 5;
const CELL_W = 264;
const CELL_H = 452;
const LIST_H = 844;
const CAT_ROW = 76;

type Key = number | 'all' | 'fav';

/** Position mémorisée par type (Films / Séries) pour la session. */
const memory: { [kind: string]: { cat: number; idx: { [cat: string]: number } } } = {};

/** Films ou séries : catégories + grille de jaquettes virtualisée et paginée. */
export function BrowseScreen({ params }: { params?: Record<string, unknown> }) {
  const kind = (params && params.kind) === 'series' ? 'series' : 'vod';
  const title = kind === 'vod' ? 'Films' : 'Séries';
  const mem = memory[kind] || (memory[kind] = { cat: 0, idx: {} });
  const app = useApp();
  const [cats, setCats] = useState<TvCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catIdx, setCatIdx] = useState(mem.cat);
  const [loaded, setLoaded] = useState(mem.cat);
  const [idx, setIdx] = useState(0);
  const [pinFor, setPinFor] = useState<number | null>(null);
  /** Incrémenté pour recharger la grille (ex. après déverrouillage parental). */
  const [reload, setReload] = useState(0);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    api
      .categories(kind)
      .then(setCats)
      .catch((e: ApiError) => e.status !== 401 && setError(e.message));
  }, [kind]);

  // 0 = Tous, 1 = Favoris, puis les catégories de la playlist.
  const keyOf = (i: number): Key => (i === 0 ? 'all' : i === 1 ? 'fav' : cats ? cats[i - 2]!.id : 'all');
  const catOf = (i: number) => (cats && i >= 2 ? cats[i - 2] : undefined);

  const open = (i: number) => {
    const c = catOf(i);
    if (c && needsPin(c.locked)) setPinFor(i);
    else setLoaded(i);
  };

  // Chargement différé quand on parcourt les catégories (sauf verrouillées : OK requis).
  useEffect(() => {
    if (catIdx === loaded) return undefined;
    const c = catOf(catIdx);
    if (c && needsPin(c.locked)) return undefined;
    const t = window.setTimeout(() => setLoaded(catIdx), 250);
    return () => window.clearTimeout(t);
  }, [catIdx]);

  const source = useMemo(
    () =>
      cats
        ? new PagedSource<PosterCard>(String(keyOf(loaded)), (o, l) => api.posters(kind, keyOf(loaded), o, l), () => rerender(undefined))
        : null,
    [cats, loaded, reload],
  );
  useEffect(() => {
    if (!source) return undefined;
    mem.cat = loaded;
    setIdx(mem.idx[source.key] || 0);
    source.ensure(0);
    return () => source.dispose();
  }, [source]);
  useEffect(() => {
    if (!source) return;
    mem.idx[source.key] = idx;
    source.ensureRange(idx - COLS * 4, idx + COLS * 6);
  }, [idx, source]);

  // Focus initial sur la grille dès son premier affichage (les catégories arrivent avant).
  const initialFocus = useRef(false);
  useEffect(() => {
    if (!initialFocus.current && source && source.total > 0) {
      initialFocus.current = true;
      focus.focus('b-grid-' + kind);
    }
  });

  if (error) {
    return (
      <div class="screen">
        <ScreenHeader title={title} backHint="Accueil" />
        <p class="hero-sub">{error}</p>
      </div>
    );
  }

  const count = cats ? cats.length + 2 : 0;
  const total = source ? Math.max(0, source.total) : 0;
  const locked = source && source.error && source.error.code === 'locked';

  return (
    <div class="screen">
      <ScreenHeader title={title} backHint="Accueil" />
      <div class="browse">
        <div class="col-cats">
          {cats && (
            <VirtualList
              id={'b-cats-' + kind}
              count={count}
              rowHeight={CAT_ROW}
              height={LIST_H}
              index={catIdx}
              onIndex={setCatIdx}
              onSelect={open}
              renderRow={(i) => {
                const c = catOf(i);
                return (
                  <div class="cat-row">
                    <span class="cat-name">{i === 0 ? 'Tous' : i === 1 ? '♥ Favoris' : c!.name}</span>
                    {c && c.locked && <span class="cat-lock">🔒</span>}
                    {c && <span class="cat-count">{c.count}</span>}
                  </div>
                );
              }}
            />
          )}
        </div>
        <div class="browse-grid">
          {locked ? (
            <div class="empty">
              Catégorie protégée.
              <div class="row-actions">
                <Button id="b-unlock" variant="primary" onSelect={() => setPinFor(loaded)}>
                  Saisir le code
                </Button>
              </div>
            </div>
          ) : source && source.total === 0 ? (
            <p class="empty">{loaded === 1 ? 'Aucun favori pour l’instant (bouton ♡ sur une fiche).' : 'Rien dans cette catégorie.'}</p>
          ) : source && source.total > 0 ? (
            <VirtualGrid
              id={'b-grid-' + kind}
              autoFocus
              count={total}
              columns={COLS}
              cellW={CELL_W}
              cellH={CELL_H}
              height={LIST_H}
              index={Math.min(idx, total - 1)}
              onIndex={setIdx}
              onSelect={(i) => {
                const it = source.get(i);
                if (it) app.push(kind === 'vod' ? 'movie' : 'seriesDetail', { id: it.id });
              }}
              renderCell={(i) => <PosterTile item={source.get(i)} />}
            />
          ) : (
            <div class="skeleton-grid">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} class="card poster skeleton" />
              ))}
            </div>
          )}
        </div>
      </div>
      {pinFor !== null && (
        <PinDialog
          onClose={() => setPinFor(null)}
          onUnlocked={() => {
            setLoaded(pinFor);
            setPinFor(null);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
