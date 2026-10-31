import { useEffect, useState } from 'preact/hooks';
import type { VNode } from 'preact';
import { BRAND, type HomeResponse } from '@iptv/shared';
import { useApp } from '../app-context';
import { api, API_URL } from '../lib/api';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { Row } from '../components/Row';
import { ChannelTile, PosterTile, WideTile, progressRatio } from '../components/Cards';

/** Hauteurs (base 1080p) des rangées, pour le défilement vertical. */
const H = { wide: 380, poster: 504, chan: 280 };
const MENU_H = 200;

/** Dernière rangée focalisée (retour sur l'accueil au même endroit). */
let lastRow = -1;

export function HomeScreen() {
  const app = useApp();
  const me = app.me;
  const [data, setData] = useState<HomeResponse | null>(null);
  const [active, setActive] = useState(lastRow);

  // Revalide le profil à chaque retour sur l'accueil (révocation, nouvelle playlist).
  useEffect(() => {
    app.boot();
  }, []);
  const playlistId = me && me.playlist ? me.playlist.id : null;
  useEffect(() => {
    if (playlistId) api.home().then(setData).catch(() => undefined);
  }, [playlistId]);

  if (me && !me.playlist) {
    return (
      <div class="screen">
        <ScreenHeader title="Accueil" backHint="Quitter" />
        <section class="hero">
          <p class="eyebrow">{me.device.name}</p>
          <h1 class="hero-title">Bienvenue sur {BRAND.name}</h1>
          <p class="hero-sub">
            Aucune playlist n&apos;est assignée à cette TV. Ajoutez-en une depuis
            <strong class="accent"> {API_URL.replace(/^https?:\/\//, '')}</strong>, elle apparaîtra ici automatiquement.
          </p>
          <div class="row-actions">
            <Button id="home-refresh" variant="primary" onSelect={app.boot} autoFocus>
              Actualiser
            </Button>
            <Button id="home-settings" onSelect={() => app.push('settings')}>
              Réglages
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const focusRow = (i: number) => {
    lastRow = i;
    setActive(i);
  };

  const rows: { h: number; node: (i: number) => VNode }[] = [];
  if (data) {
    if (data.continue.length)
      rows.push({
        h: H.wide,
        node: (i) => (
          <Row
            id="row-continue"
            title="Reprendre la lecture"
            count={data.continue.length}
            itemWidth={408}
            height={H.wide}
            onFocus={() => focusRow(i)}
            onSelect={(k) => {
              const c = data.continue[k]!;
              app.push(c.kind === 'vod' ? 'movie' : 'seriesDetail', { id: c.parentId });
            }}
            renderItem={(k) => {
              const c = data.continue[k]!;
              return <WideTile image={c.image} title={c.name} subtitle={c.subtitle} progress={progressRatio(c.progress)} />;
            }}
          />
        ),
      });
    const chanRow = (id: string, title: string, list: HomeResponse['favoriteChannels']) =>
      list.length &&
      rows.push({
        h: H.chan,
        node: (i) => (
          <Row
            id={id}
            title={title}
            count={list.length}
            itemWidth={264}
            height={H.chan}
            onFocus={() => focusRow(i)}
            onSelect={(k) => app.push('live', { play: list[k], returnOnExit: true })}
            renderItem={(k) => <ChannelTile ch={list[k]!} />}
          />
        ),
      });
    chanRow('row-fav', 'Chaînes favorites', data.favoriteChannels);
    chanRow('row-recent', 'Récemment regardé', data.recentChannels);
    const posterRow = (id: string, title: string, list: HomeResponse['recentMovies'], screen: 'movie' | 'seriesDetail') =>
      list.length &&
      rows.push({
        h: H.poster,
        node: (i) => (
          <Row
            id={id}
            title={title}
            count={list.length}
            itemWidth={264}
            height={H.poster}
            onFocus={() => focusRow(i)}
            onSelect={(k) => app.push(screen, { id: list[k]!.id })}
            renderItem={(k) => <PosterTile item={list[k]} />}
          />
        ),
      });
    posterRow('row-movies', 'Films ajoutés récemment', data.recentMovies, 'movie');
    posterRow('row-series', 'Séries', data.series, 'seriesDetail');
  }

  // Défilement : la rangée focalisée remonte sous le menu.
  let offset = 0;
  for (let i = 0; i < active && i < rows.length; i++) offset += rows[i]!.h;
  const translate = active >= 0 ? -(offset + MENU_H) + 40 : 0;

  return (
    <div class="screen home">
      <ScreenHeader title="Accueil" backHint="Quitter" />
      <div class="home-scroll" style={{ transform: 'translateY(' + translate + 'px)', WebkitTransform: 'translateY(' + translate + 'px)' }}>
        <p class="eyebrow home-eyebrow">
          {me ? me.device.name : ''}
          {me && me.playlist ? <span class="muted"> · {me.playlist.name}</span> : null}
        </p>
        <nav class="home-menu" aria-label="Menu">
          <Button id="menu-live" variant="primary" autoFocus={lastRow < 0} onSelect={() => app.push('live')} onFocus={() => focusRow(-1)}>
            TV en direct
          </Button>
          <Button id="menu-guide" onSelect={() => app.push('guide')} onFocus={() => focusRow(-1)}>
            Guide TV
          </Button>
          <Button id="menu-movies" onSelect={() => app.push('movies', { kind: 'vod' })} onFocus={() => focusRow(-1)}>
            Films
          </Button>
          <Button id="menu-series" onSelect={() => app.push('series', { kind: 'series' })} onFocus={() => focusRow(-1)}>
            Séries
          </Button>
          <Button id="menu-search" onSelect={() => app.push('search')} onFocus={() => focusRow(-1)}>
            Recherche
          </Button>
          <Button id="menu-settings" onSelect={() => app.push('settings')} onFocus={() => focusRow(-1)}>
            Réglages
          </Button>
        </nav>
        {data ? (
          rows.map((r, i) => <div key={i}>{r.node(i)}</div>)
        ) : (
          <div class="home-skeleton">
            <div class="skeleton-title skeleton" />
            <div class="skeleton-row-cards">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} class="card poster skeleton" />
              ))}
            </div>
          </div>
        )}
        {data && !rows.length && (
          <p class="hero-sub">
            {me && me.playlist && me.playlist.status === 'syncing'
              ? 'Synchronisation de votre playlist en cours…'
              : 'Commencez par la TV en direct, les films ou les séries.'}
          </p>
        )}
      </div>
    </div>
  );
}
