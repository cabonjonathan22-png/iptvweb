import { useEffect, useState } from 'preact/hooks';
import type { SearchResponse } from '@iptv/shared';
import { useApp } from '../app-context';
import { api } from '../lib/api';
import { useKeyHandler } from '../nav/hooks';
import { isPointerDevice } from '../lib/device';
import { ScreenHeader } from '../components/ScreenHeader';
import { Keyboard } from '../components/Keyboard';
import { Row } from '../components/Row';
import { ChannelTile, PosterTile } from '../components/Cards';

const DEBOUNCE_MS = 300;
let lastQuery = '';

/** Recherche globale : clavier virtuel + résultats instantanés (chaînes, films, séries). */
export function SearchScreen() {
  const app = useApp();
  const [q, setQ] = useState(lastQuery);
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeRow, setActiveRow] = useState(0);

  useEffect(() => {
    lastQuery = q;
    if (q.trim().length < 2) {
      setRes(null);
      return undefined;
    }
    setLoading(true);
    let alive = true;
    const t = window.setTimeout(() => {
      api
        .search(q)
        .then((r) => alive && setRes(r))
        .catch(() => undefined)
        .then(() => alive && setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  // PC : le clavier physique saisit directement (lettres, espace, retour arrière).
  useEffect(() => {
    if (!isPointerDevice) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace') setQ((v) => v.slice(0, -1));
      else if (/^[^\d]$/.test(e.key)) setQ((v) => (v + e.key).slice(0, 40));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // Chiffres de la télécommande : saisis directement.
  useKeyHandler((k) => {
    if (k.action === 'digit') {
      setQ((v) => (v + k.digit).slice(0, 40));
      return true;
    }
    return false;
  });

  const empty = res && !res.channels.length && !res.movies.length && !res.series.length;
  // Défilement vertical des résultats : la rangée focalisée remonte en haut.
  const heights = res ? [res.channels.length ? 280 : 0, res.movies.length ? 504 : 0, res.series.length ? 504 : 0] : [];
  let shift = 0;
  for (let i = 0; i < activeRow; i++) shift += heights[i] || 0;

  return (
    <div class="screen">
      <ScreenHeader title="Recherche" backHint="Accueil" />
      <div class="search">
        <div class="search-left">
          <div class="search-query">
            {q || <span class="muted">Titre, chaîne…</span>}
            <span class="osd-caret">_</span>
          </div>
          <Keyboard
            onKey={(c) => setQ((v) => (v + c).slice(0, 40))}
            onDelete={() => setQ((v) => v.slice(0, -1))}
            onClear={() => setQ('')}
          />
        </div>
        <div class="search-results">
          <div style={{ transform: 'translateY(' + -shift + 'px)', WebkitTransform: 'translateY(' + -shift + 'px)' }} class="search-scroll">
          {loading && !res && <div class="spinner" />}
          {!res && !loading && <p class="empty">Saisissez au moins 2 caractères.</p>}
          {empty && <p class="empty">Aucun résultat pour « {q} ».</p>}
          {res && res.channels.length > 0 && (
            <Row
              key={'c' + q}
              id="sr-channels"
              viewWidth={980}
              onFocus={() => setActiveRow(0)}
              title="Chaînes"
              count={res.channels.length}
              itemWidth={264}
              height={280}
              onSelect={(i) => app.push('live', { play: res.channels[i], returnOnExit: true })}
              renderItem={(i) => <ChannelTile ch={res.channels[i]!} />}
            />
          )}
          {res && res.movies.length > 0 && (
            <Row
              key={'m' + q}
              id="sr-movies"
              viewWidth={980}
              onFocus={() => setActiveRow(1)}
              title="Films"
              count={res.movies.length}
              itemWidth={264}
              height={504}
              onSelect={(i) => app.push('movie', { id: res.movies[i]!.id })}
              renderItem={(i) => <PosterTile item={res.movies[i]} />}
            />
          )}
          {res && res.series.length > 0 && (
            <Row
              key={'s' + q}
              id="sr-series"
              viewWidth={980}
              onFocus={() => setActiveRow(2)}
              title="Séries"
              count={res.series.length}
              itemWidth={264}
              height={504}
              onSelect={(i) => app.push('seriesDetail', { id: res.series[i]!.id })}
              renderItem={(i) => <PosterTile item={res.series[i]} />}
            />
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
