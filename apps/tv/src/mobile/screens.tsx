import { useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { ContentLanguage, Episode, Handoff, HomeResponse, MovieDetail, PlaylistSummary, PosterCard, SearchResponse, SeriesDetail, TvCategory, TvChannel } from '@iptv/shared';
import { api, API_URL, ApiError } from '../lib/api';
import { epgFor, onEpgChange } from '../lib/epg-store';
import { clock, duration } from '../lib/format';
import { dismissInstall, hasNativePrompt, isInstalled, onInstallChange, promptInstall, shouldSuggestInstall } from '../lib/install';
import { isIOS } from '../lib/device';
import { localPosition } from '../lib/local-progress';
import { PagedSource } from '../lib/paged-source';
import { prefs, type LiveMode } from '../lib/prefs';
import { needsPin, session } from '../lib/session';
import { storage } from '../lib/storage';
import { progressRatio } from '../components/Cards';
import { Img } from '../components/Img';
import { Logo } from '../components/Logo';
import { usePairing } from '../screens/usePairing';
import { useMobile } from './context';
import type { VodPlayback } from './Player';
import { RemoteSheet } from './Remote';
import { ChannelRow, ErrorState, Header, PinInput, PinSheet, PosterTile, posterMeta, Row, Sheet, Spinner, Windowed } from './ui';

type Key = number | 'all' | 'fav';

/* --------------------------------------------------------------- Liaison */

export function PairingScreen() {
  const app = useMobile();
  const { state, data, remaining, start } = usePairing(app.boot);
  const p2 = (n: number) => (n < 10 ? '0' + n : String(n));
  return (
    <div class="m-screen m-pairing">
      <Logo size={56} />
      <h1>Liez cet appareil à votre compte</h1>
      <p class="m-muted">Connectez-vous au dashboard : le code est déjà rempli, il suffit de valider.</p>
      <div class="m-code" aria-live="polite">
        {data ? data.code : '······'}
      </div>
      {state.phase === 'error' ? (
        <p class="m-error">{state.message}</p>
      ) : (
        <p class="m-muted">{data ? 'En attente de liaison · code valable ' + Math.floor(remaining / 60) + ':' + p2(remaining % 60) : 'Préparation du code…'}</p>
      )}
      {data && (
        <a class="m-btn m-btn-primary" href={data.linkUrl} target="_blank" rel="noopener">
          Lier cet appareil
        </a>
      )}
      <button class="m-btn" onClick={start}>
        Nouveau code
      </button>
      {data && <p class="m-muted m-small">Sur un autre appareil : {data.linkUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ Installation */

export function InstallHelp({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Installer Oria" onClose={onClose}>
      {isIOS ? (
        <ol class="m-steps">
          <li>Touchez le bouton Partager du navigateur.</li>
          <li>Choisissez « Sur l'écran d'accueil ».</li>
          <li>Validez avec « Ajouter ».</li>
        </ol>
      ) : (
        <ol class="m-steps">
          <li>Ouvrez le menu du navigateur (⋮).</li>
          <li>Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».</li>
        </ol>
      )}
    </Sheet>
  );
}

function useInstallState() {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onInstallChange(() => tick(undefined)), []);
}

function InstallBanner() {
  useInstallState();
  const [help, setHelp] = useState(false);
  if (!shouldSuggestInstall()) return null;
  return (
    <div class="m-install">
      <div class="m-install-text">
        <strong>Installez Oria</strong>
        <span>Une icône sur l'écran d'accueil et le plein écran, sans passer par un store.</span>
      </div>
      <div class="m-actions">
        <button class="m-btn m-btn-primary" onClick={() => (hasNativePrompt() ? promptInstall() : setHelp(true))}>
          Installer
        </button>
        <button class="m-btn" onClick={dismissInstall}>
          Plus tard
        </button>
      </div>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- Reprise */

const HANDOFF_SEEN = 'handoffSeen';

/** Continuer ici ce qui a été commencé sur un autre appareil. */
function HandoffCard() {
  const app = useMobile();
  const [h, setH] = useState<Handoff | null>(null);
  const stamp = (x: Handoff) => (x.kind === 'live' ? 'live:' + x.channel.id : x.kind + ':' + x.id);
  useEffect(() => {
    api
      .handoff()
      .then((r) => {
        if (r && storage.getPref<string>(HANDOFF_SEEN, '') !== stamp(r)) setH(r);
      })
      .catch(() => undefined);
  }, []);
  if (!h) return null;
  const dismiss = () => {
    storage.setPref(HANDOFF_SEEN, stamp(h));
    setH(null);
  };
  const resume = () => {
    dismiss();
    if (h.kind === 'live') app.push({ name: 'playLive', channel: h.channel });
    else if (h.kind === 'vod') app.push({ name: 'playVod', playback: { kind: 'vod', id: h.id, title: h.name, startAt: h.position } });
    else {
      api
        .series(h.seriesId)
        .then((s) => app.push({ name: 'playVod', playback: episodePlayback(s, h.id, h.position) }))
        .catch(() => app.push({ name: 'show', id: h.seriesId }));
    }
  };
  return (
    <div class="m-install">
      <div class="m-install-text">
        <strong>Continuer ici ?</strong>
        <span>
          {h.kind === 'live' ? h.channel.name : h.name + (h.subtitle ? ' · ' + h.subtitle : '') + ', à ' + clock(h.position)}, sur {h.deviceName}
        </span>
      </div>
      <div class="m-actions">
        <button class="m-btn m-btn-primary" onClick={resume}>
          {h.kind === 'live' ? 'Regarder' : 'Reprendre'}
        </button>
        <button class="m-btn" onClick={dismiss}>
          Plus tard
        </button>
      </div>
    </div>
  );
}

/** Lecture d'un épisode, suivis des suivants de la série. */
function episodePlayback(s: SeriesDetail, episodeId: number, startAt: number): VodPlayback {
  const all = s.seasons.reduce((acc: Episode[], se) => acc.concat(se.episodes), []);
  const label = (e: Episode) => 'S' + e.season + ' · E' + e.episode + (e.title ? ' · ' + e.title : '');
  const of = (e: Episode, at: number): VodPlayback => ({ kind: 'episode', id: e.id, seriesId: s.id, title: s.name, subtitle: label(e), startAt: at });
  const i = Math.max(0, all.findIndex((e) => e.id === episodeId));
  return { ...of(all[i]!, startAt), queue: all.slice(i + 1).map((e) => of(e, 0)) };
}

/* ---------------------------------------------------------------- Accueil */

export function HomeScreen() {
  const app = useMobile();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const load = () => {
    setError(null);
    api.home().then(setHome).catch(setError);
  };
  useEffect(load, []);

  const playChannel = (channel: TvChannel) => app.push({ name: 'playLive', channel });
  const empty =
    home && !home.continue.length && !home.favoriteChannels.length && !home.recentChannels.length && !home.recentMovies.length && !home.series.length;

  return (
    <div class="m-screen">
      <div class="m-home-head">
        <Logo size={32} />
      </div>
      <div class="m-fill m-scroll">
        <HandoffCard />
        <InstallBanner />
        {error && <ErrorState error={error} onRetry={load} />}
        {!home && !error && <Spinner />}
        {empty && (
          <div class="m-empty">
            <h2>Rien à afficher pour l'instant</h2>
            <p>La synchronisation de votre playlist est peut-être en cours.</p>
            <button class="m-btn m-btn-primary" onClick={load}>
              Actualiser
            </button>
          </div>
        )}
        {home && home.continue.length > 0 && (
          <Row title="Reprendre">
            {home.continue.map((c) => (
              <PosterTile
                key={c.kind + c.id}
                name={c.name}
                image={c.image}
                meta={c.subtitle}
                progress={progressRatio(c.progress)}
                onOpen={() => app.push(c.kind === 'vod' ? { name: 'movie', id: c.parentId } : { name: 'show', id: c.parentId })}
              />
            ))}
          </Row>
        )}
        {home && home.favoriteChannels.length > 0 && (
          <Row title="Chaînes favorites">
            {home.favoriteChannels.map((c) => (
              <ChannelTile key={c.id} channel={c} onOpen={() => playChannel(c)} />
            ))}
          </Row>
        )}
        {home && home.recentChannels.length > 0 && (
          <Row title="Regardées récemment">
            {home.recentChannels.map((c) => (
              <ChannelTile key={c.id} channel={c} onOpen={() => playChannel(c)} />
            ))}
          </Row>
        )}
        {home && home.recentMovies.length > 0 && (
          <Row title="Films récents">
            {home.recentMovies.map((m) => (
              <PosterTile key={m.id} name={m.name} image={m.poster} meta={posterMeta(m)} onOpen={() => app.push({ name: 'movie', id: m.id })} />
            ))}
          </Row>
        )}
        {home && home.series.length > 0 && (
          <Row title="Séries">
            {home.series.map((s) => (
              <PosterTile key={s.id} name={s.name} image={s.poster} meta={posterMeta(s)} onOpen={() => app.push({ name: 'show', id: s.id })} />
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}

function ChannelTile({ channel, onOpen }: { channel: TvChannel; onOpen: () => void }) {
  return (
    <button class="m-tile" onClick={onOpen}>
      <Img key={channel.logo || channel.id} src={channel.logo} name={channel.name} class="m-tile-logo" />
      <span class="m-tile-name">{channel.name}</span>
    </button>
  );
}

/* ---------------------------------------------- Choix d'une catégorie */

function useCategory(kind: 'live' | 'vod' | 'series') {
  const [cats, setCats] = useState<TvCategory[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [key, setKey] = useState<Key>('all');
  const load = () => {
    setError(null);
    api.categories(kind).then(setCats).catch(setError);
  };
  useEffect(load, [kind]);
  return { cats, error, key, setKey, load };
}

function CategoryPicker({ cats, value, onChange }: { cats: TvCategory[]; value: Key; onChange: (k: Key) => void }) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState<TvCategory | null>(null);
  const label = value === 'all' ? 'Toutes les catégories' : value === 'fav' ? '♥ Favoris' : (cats.find((c) => c.id === value) || { name: 'Catégorie' }).name;
  const pick = (k: Key) => {
    setOpen(false);
    onChange(k);
  };
  const item = (k: Key, name: string, count?: number, isLocked?: boolean) => (
    <button
      key={k}
      class={'m-list-item' + (k === value ? ' is-on' : '')}
      onClick={() => {
        const cat = typeof k === 'number' ? cats.find((c) => c.id === k) : undefined;
        if (cat && needsPin(cat.locked)) setLocked(cat);
        else pick(k);
      }}
    >
      <span>
        {isLocked ? '🔒 ' : ''}
        {name}
      </span>
      {count !== undefined && <span class="m-muted">{count}</span>}
    </button>
  );
  return (
    <>
      <button class="m-picker" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span>{label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && !locked && (
        <Sheet title="Catégories" onClose={() => setOpen(false)}>
          <div class="m-list">
            {item('all', 'Toutes les catégories')}
            {item('fav', '♥ Favoris')}
            {cats.map((c) => item(c.id, c.name, c.count, c.locked))}
          </div>
        </Sheet>
      )}
      {locked && (
        <PinSheet
          onClose={() => setLocked(null)}
          onUnlocked={() => {
            const id = locked.id;
            setLocked(null);
            pick(id);
          }}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------------- Direct */

export function LiveScreen() {
  const app = useMobile();
  const { cats, error, key, setKey, load } = useCategory('live');
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [favs, setFavs] = useState<{ [id: number]: true }>({});
  const source = useMemo(() => new PagedSource<TvChannel>(String(key), (o, l) => api.liveChannels(key, o, l), () => rerender(undefined)), [key]);

  useEffect(() => {
    source.ensure(0);
    return () => source.dispose();
  }, [source]);
  useEffect(() => {
    api
      .liveChannels('fav', 0, 200)
      .then((r) => {
        const m: { [id: number]: true } = {};
        r.items.forEach((c) => (m[c.id] = true));
        setFavs(m);
      })
      .catch(() => undefined);
    return onEpgChange(() => rerender(undefined));
  }, []);

  const toggleFav = (ch: TvChannel) => {
    const on = !favs[ch.id];
    const next = { ...favs };
    if (on) next[ch.id] = true;
    else delete next[ch.id];
    setFavs(next);
    api.setFavorite('live', ch.id, on).catch(() => setFavs(favs));
  };

  return (
    <div class="m-screen">
      <Header title="TV en direct" />
      {error && <ErrorState error={error} onRetry={load} />}
      {cats && <CategoryPicker cats={cats} value={key} onChange={setKey} />}
      {source.error && <ErrorState error={source.error} onRetry={() => source.ensure(0)} />}
      {source.total === 0 && <div class="m-empty"><p>{key === 'fav' ? 'Aucune chaîne favorite.' : 'Aucune chaîne dans cette catégorie.'}</p></div>}
      {source.total < 0 && !source.error && !error && <Spinner />}
      {source.total > 0 && (
        <Windowed
          key={source.key}
          count={source.total}
          rowHeight={() => 68}
          onRange={(a, b) => {
            source.ensureRange(a, b);
            source.loaded(a, b).forEach((c) => epgFor(c.epgId));
          }}
          render={(i) => {
            const ch = source.get(i);
            return (
              <ChannelRow
                channel={ch}
                favorite={!!ch && !!favs[ch.id]}
                onPlay={() => ch && app.push({ name: 'playLive', channel: ch, source, index: i })}
                onFavorite={() => ch && toggleFav(ch)}
              />
            );
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------- Films et séries */

export function BrowseScreen({ kind }: { kind: 'vod' | 'series' }) {
  const app = useMobile();
  const { cats, error, key, setKey, load } = useCategory(kind);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const source = useMemo(() => new PagedSource<PosterCard>(kind + key, (o, l) => api.posters(kind, key, o, l), () => rerender(undefined)), [kind, key]);
  useEffect(() => {
    source.ensure(0);
    return () => source.dispose();
  }, [source]);

  return (
    <div class="m-screen">
      <Header title={kind === 'vod' ? 'Films' : 'Séries'} />
      {error && <ErrorState error={error} onRetry={load} />}
      {cats && <CategoryPicker cats={cats} value={key} onChange={setKey} />}
      {source.error && <ErrorState error={source.error} onRetry={() => source.ensure(0)} />}
      {source.total === 0 && <div class="m-empty"><p>{key === 'fav' ? 'Aucun favori pour le moment.' : 'Rien dans cette catégorie.'}</p></div>}
      {source.total < 0 && !source.error && !error && <Spinner />}
      {source.total > 0 && (
        <Windowed
          key={source.key}
          count={source.total}
          minCell={112}
          rowHeight={(w) => Math.round((w - 12) * 1.5) + 52}
          onRange={(a, b) => source.ensureRange(a, b)}
          render={(i) => {
            const it = source.get(i);
            if (!it) return <div class="m-poster m-skeleton" />;
            return <PosterTile name={it.name} image={it.poster} meta={posterMeta(it)} onOpen={() => app.push(kind === 'vod' ? { name: 'movie', id: it.id } : { name: 'show', id: it.id })} />;
          }}
        />
      )}
    </div>
  );
}

function useLockedLoad<T>(fetch: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pin, setPin] = useState(false);
  const load = () =>
    fetch()
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e: ApiError) => {
        if (e.status === 403 && e.code === 'locked') setPin(true);
        else setError(e);
      });
  useEffect(() => {
    load();
  }, deps);
  return { data, setData, error, pin, setPin, load };
}

export function MovieScreen({ id }: { id: number }) {
  const app = useMobile();
  const { data: m, setData, error, pin, setPin, load } = useLockedLoad<MovieDetail>(() => api.movie(id), [id]);
  const pinSheet = pin && <PinSheet onClose={() => setPin(false)} onUnlocked={() => (setPin(false), load())} />;

  if (!m) {
    return (
      <div class="m-screen">
        <Header title="Film" back />
        {error ? <ErrorState error={error} onRetry={load} /> : !pin && <Spinner />}
        {pinSheet}
      </div>
    );
  }
  const resumeAt = m.progress && !m.progress.completed ? m.progress.position : localPosition('vod', m.id);
  const canResume = !!resumeAt && resumeAt > 30;
  const play = (startAt: number) => app.push({ name: 'playVod', playback: { kind: 'vod', id: m.id, title: m.name, startAt } });
  const toggleFav = () => {
    const on = !m.favorite;
    setData({ ...m, favorite: on });
    api.setFavorite('vod', m.id, on).catch(() => setData({ ...m, favorite: !on }));
  };
  return (
    <div class="m-screen">
      <Header title={m.name} back />
      <div class="m-fill m-scroll">
        <DetailTop name={m.name} poster={m.poster} backdrop={m.backdrop} meta={[m.year, duration(m.durationSec), m.rating ? '★ ' + m.rating : null].filter(Boolean).join(' · ')} genre={m.genre} />
        <div class="m-detail">
          <div class="m-actions">
            <button class="m-btn m-btn-primary" onClick={() => play(canResume ? resumeAt! : 0)}>
              ▶ {canResume ? 'Reprendre' : 'Lecture'}
            </button>
            {canResume && (
              <button class="m-btn" onClick={() => play(0)}>
                Depuis le début
              </button>
            )}
            <button class="m-btn" aria-pressed={m.favorite} onClick={toggleFav}>
              {m.favorite ? '♥ Favori' : '♡ Favori'}
            </button>
          </div>
          {m.plot && <p>{m.plot}</p>}
          {m.director && <p class="m-muted">Réalisation : {m.director}</p>}
          {m.cast && <p class="m-muted">Avec : {m.cast}</p>}
          {m.containerExt === 'mkv' && <p class="m-muted m-small">Format MKV : la lecture dépend de votre navigateur.</p>}
        </div>
      </div>
    </div>
  );
}

function DetailTop({ name, poster, backdrop, meta, genre }: { name: string; poster: string | null; backdrop: string | null; meta: string; genre: string | null }) {
  return (
    <div class="m-detail-top">
      {backdrop && <Img src={backdrop} name={name} class="m-detail-back" />}
      <div class="m-detail-shade" />
      <Img src={poster} name={name} class="m-detail-poster" />
      <div class="m-detail-head">
        <h2>{name}</h2>
        {meta && <p>{meta}</p>}
        {genre && <p class="m-muted">{genre}</p>}
      </div>
    </div>
  );
}

export function ShowScreen({ id }: { id: number }) {
  const app = useMobile();
  const { data: s, setData, error, pin, setPin, load } = useLockedLoad<SeriesDetail>(() => api.series(id), [id]);
  const [season, setSeason] = useState<number | null>(null);
  const pinSheet = pin && <PinSheet onClose={() => setPin(false)} onUnlocked={() => (setPin(false), load())} />;

  if (!s) {
    return (
      <div class="m-screen">
        <Header title="Série" back />
        {error ? <ErrorState error={error} onRetry={load} /> : !pin && <Spinner />}
        {pinSheet}
      </div>
    );
  }

  const all = s.seasons.reduce((acc: Episode[], se) => acc.concat(se.episodes), []);
  const resumeOf = (e: Episode) => (e.progress && !e.progress.completed && e.progress.position > 30 ? e.progress.position : 0);
  const playEp = (e: Episode) => app.push({ name: 'playVod', playback: episodePlayback(s, e.id, resumeOf(e)) });
  const resumeEp = s.resume ? all.find((e) => e.id === s.resume!.episodeId) : all[0];
  const shownSeason = season !== null ? season : resumeEp ? resumeEp.season : s.seasons[0] ? s.seasons[0].season : 0;
  const current = s.seasons.find((x) => x.season === shownSeason);
  const toggleFav = () => {
    const on = !s.favorite;
    setData({ ...s, favorite: on });
    api.setFavorite('series', s.id, on).catch(() => setData({ ...s, favorite: !on }));
  };

  return (
    <div class="m-screen">
      <Header title={s.name} back />
      <div class="m-fill m-scroll">
        <DetailTop name={s.name} poster={s.poster} backdrop={s.backdrop} meta={[s.year, s.rating ? '★ ' + s.rating : null].filter(Boolean).join(' · ')} genre={s.genre} />
        <div class="m-detail">
          <div class="m-actions">
            {resumeEp && (
              <button class="m-btn m-btn-primary" onClick={() => playEp(resumeEp)}>
                ▶ {s.resume && s.resume.position > 0 ? 'Reprendre' : 'Lecture'} S{resumeEp.season} E{resumeEp.episode}
              </button>
            )}
            <button class="m-btn" aria-pressed={s.favorite} onClick={toggleFav}>
              {s.favorite ? '♥ Favori' : '♡ Favori'}
            </button>
          </div>
          {s.plot && <p>{s.plot}</p>}
          {s.seasons.length > 1 && (
            <div class="m-chips m-chips-scroll">
              {s.seasons.map((se) => (
                <button key={se.season} class={'m-chip' + (se.season === shownSeason ? ' is-on' : '')} onClick={() => setSeason(se.season)}>
                  Saison {se.season}
                </button>
              ))}
            </div>
          )}
          {current && current.episodes.length ? (
            current.episodes.map((e) => (
              <button key={e.id} class="m-ep" onClick={() => playEp(e)}>
                <span class="m-ep-thumb">
                  <Img key={e.thumb || e.id} src={e.thumb} name={s.name} class="m-img-fill" />
                  {e.progress && (
                    <span class="m-bar m-poster-bar">
                      <i style={{ width: (e.progress.completed ? 100 : progressRatio(e.progress) * 100) + '%' }} />
                    </span>
                  )}
                </span>
                <span class="m-ep-text">
                  <strong>
                    {e.episode}. {e.title || 'Épisode ' + e.episode}
                  </strong>
                  <span class="m-muted m-small">
                    {duration(e.durationSec)}
                    {e.progress && e.progress.completed ? ' · ✓ Vu' : ''}
                  </span>
                  {e.plot && <span class="m-ep-plot">{e.plot}</span>}
                </span>
              </button>
            ))
          ) : (
            <p class="m-muted">Aucun épisode disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Recherche */

export function SearchScreen() {
  const app = useMobile();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    const n = ++seq.current;
    if (term.length < 2) {
      setRes(null);
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    const t = window.setTimeout(() => {
      api
        .search(term)
        .then((r) => {
          if (n === seq.current) setRes(r);
        })
        .catch(() => {
          if (n === seq.current) setRes({ channels: [], movies: [], series: [] });
        })
        .then(() => {
          if (n === seq.current) setBusy(false);
        });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const none = res && !res.channels.length && !res.movies.length && !res.series.length;
  return (
    <div class="m-screen">
      <Header title="Recherche" />
      <div class="m-search">
        <input
          type="search"
          placeholder="Chaîne, film, série…"
          aria-label="Rechercher"
          enterKeyHint="search"
          value={q}
          onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <div class="m-fill m-scroll">
        {busy && !res && <Spinner />}
        {none && <div class="m-empty"><p>Aucun résultat pour « {q.trim()} ».</p></div>}
        {res && res.channels.length > 0 && (
          <section class="m-row">
            <h2 class="m-row-title">Chaînes</h2>
            {res.channels.map((c) => (
              <ChannelRow key={c.id} channel={c} onPlay={() => app.push({ name: 'playLive', channel: c })} />
            ))}
          </section>
        )}
        {res && res.movies.length > 0 && (
          <Row title="Films">
            {res.movies.map((m) => (
              <PosterTile key={m.id} name={m.name} image={m.poster} meta={posterMeta(m)} onOpen={() => app.push({ name: 'movie', id: m.id })} />
            ))}
          </Row>
        )}
        {res && res.series.length > 0 && (
          <Row title="Séries">
            {res.series.map((s) => (
              <PosterTile key={s.id} name={s.name} image={s.poster} meta={posterMeta(s)} onOpen={() => app.push({ name: 'show', id: s.id })} />
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Réglages */

const TRACK_LANGS: [string, string][] = [
  ['', 'Par défaut'],
  ['fr', 'Français'],
  ['en', 'Anglais'],
  ['es', 'Espagnol'],
  ['de', 'Allemand'],
  ['it', 'Italien'],
  ['pt', 'Portugais'],
  ['ar', 'Arabe'],
];

export function SettingsScreen() {
  const app = useMobile();
  const [panel, setPanel] = useState<null | 'playlists' | 'langs' | 'pin' | 'unlink' | 'install' | 'remote'>(null);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    // Le chargement du démarrage peut ne pas être terminé.
    api
      .settings()
      .then((st) => {
        session.settings = st;
        refresh(undefined);
      })
      .catch(() => undefined);
    return onInstallChange(() => refresh(undefined));
  }, []);
  const s = session.settings;
  const close = () => setPanel(null);

  const saveTrack = (key: 'audioLang' | 'subtitleLang', value: string) => {
    s[key] = value || null;
    refresh(undefined);
    api.saveSettings({ [key]: value || null }).catch(() => undefined);
  };

  return (
    <div class="m-screen">
      <Header title="Réglages" />
      <div class="m-fill m-scroll">
        <div class="m-group">
          <button class="m-set" onClick={() => setPanel('playlists')}>
            <span>Playlist</span>
            <span class="m-muted">{app.me && app.me.playlist ? app.me.playlist.name : 'aucune'}</span>
          </button>
          <button class="m-set" onClick={() => setPanel('langs')}>
            <span>Langues du contenu</span>
            <span class="m-muted">{s.contentLangs.length ? s.contentLangs.map((c) => c.toUpperCase()).join(', ') : 'toutes'}</span>
          </button>
        </div>
        <div class="m-group">
          <label class="m-set">
            <span>Langue audio</span>
            <select value={s.audioLang || ''} onChange={(e) => saveTrack('audioLang', (e.currentTarget as HTMLSelectElement).value)}>
              {TRACK_LANGS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label class="m-set">
            <span>Sous-titres</span>
            <select value={s.subtitleLang || ''} onChange={(e) => saveTrack('subtitleLang', (e.currentTarget as HTMLSelectElement).value)}>
              {TRACK_LANGS.map(([v, l]) => (
                <option key={v} value={v}>
                  {v ? l : 'Désactivés'}
                </option>
              ))}
            </select>
          </label>
          <label class="m-set">
            <span>Format du direct</span>
            <select
              value={prefs.liveMode}
              onChange={(e) => {
                prefs.liveMode = (e.currentTarget as HTMLSelectElement).value as LiveMode;
                refresh(undefined);
              }}
            >
              <option value="auto">Auto</option>
              <option value="hls">HLS</option>
              <option value="ts">MPEG-TS</option>
            </select>
          </label>
        </div>
        <div class="m-group">
          <button class="m-set" onClick={() => setPanel('remote')}>
            <span>Télécommande de la TV</span>
            <span class="m-muted">›</span>
          </button>
          <button class="m-set" onClick={() => setPanel('pin')}>
            <span>Contrôle parental</span>
            <span class="m-muted">{s.hasPin ? 'code défini' : 'aucun code'}</span>
          </button>
          {!isInstalled() && (
            <button class="m-set" onClick={() => (hasNativePrompt() ? promptInstall() : setPanel('install'))}>
              <span>Installer l'application</span>
              <span class="m-muted">›</span>
            </button>
          )}
          <a class="m-set" href={API_URL + '/playlists'} target="_blank" rel="noopener">
            <span>Ouvrir le dashboard</span>
            <span class="m-muted">›</span>
          </a>
        </div>
        <div class="m-group">
          <div class="m-set">
            <span>Appareil</span>
            <span class="m-muted">{app.me ? app.me.device.name : '—'}</span>
          </div>
          <div class="m-set">
            <span>Compte</span>
            <span class="m-muted">{(app.me && app.me.account.email) || '—'}</span>
          </div>
          <button class="m-set m-danger" onClick={() => setPanel('unlink')}>
            <span>Délier cet appareil</span>
          </button>
        </div>
      </div>
      {panel === 'playlists' && <PlaylistsSheet onClose={close} />}
      {panel === 'langs' && <LanguagesSheet onClose={close} onChange={() => refresh(undefined)} />}
      {panel === 'install' && <InstallHelp onClose={close} />}
      {panel === 'remote' && <RemoteSheet onClose={close} />}
      {panel === 'pin' && (
        <PinSetupSheet
          hasPin={s.hasPin}
          onClose={close}
          onDone={(has) => {
            s.hasPin = has;
            close();
          }}
        />
      )}
      {panel === 'unlink' && <UnlinkSheet onClose={close} />}
    </div>
  );
}

function PlaylistsSheet({ onClose }: { onClose: () => void }) {
  const app = useMobile();
  const [list, setList] = useState<PlaylistSummary[] | null>(null);
  useEffect(() => {
    api.playlists().then(setList).catch(() => setList([]));
  }, []);
  return (
    <Sheet title="Playlist active" onClose={onClose}>
      {!list && <Spinner />}
      {list && !list.length && <p class="m-muted">Aucune playlist : ajoutez-en une depuis le dashboard.</p>}
      <div class="m-list">
        {list &&
          list.map((p) => (
            <button
              key={p.id}
              class={'m-list-item' + (p.active ? ' is-on' : '')}
              onClick={() =>
                api.setActivePlaylist(p.id).then(() => {
                  onClose();
                  app.boot();
                })
              }
            >
              <span>{p.name}</span>
              {p.status === 'syncing' && <span class="m-muted">synchronisation…</span>}
            </button>
          ))}
      </div>
    </Sheet>
  );
}

function LanguagesSheet({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const [list, setList] = useState<ContentLanguage[] | null>(null);
  const [selected, setSelected] = useState<string[]>(session.settings.contentLangs);
  useEffect(() => {
    api.languages().then(setList).catch(() => setList([]));
  }, []);
  const save = (next: string[]) => {
    setSelected(next);
    session.settings.contentLangs = next;
    onChange();
    api.saveSettings({ contentLangs: next }).catch(() => undefined);
  };
  return (
    <Sheet title="Langues du contenu" onClose={onClose}>
      <p class="m-muted">Seules les catégories de ces langues s'affichent. Celles sans langue reconnue restent visibles.</p>
      {!list && <Spinner />}
      {list && !list.length && <p class="m-muted">Aucune langue reconnue dans cette playlist.</p>}
      <div class="m-chips">
        <button class={'m-chip' + (selected.length ? '' : ' is-on')} aria-pressed={!selected.length} onClick={() => save([])}>
          Toutes
        </button>
        {list &&
          list.map((l) => {
            const on = selected.indexOf(l.code) >= 0;
            return (
              <button key={l.code} class={'m-chip' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => save(on ? selected.filter((c) => c !== l.code) : selected.concat([l.code]))}>
                {l.label} ({l.categories})
              </button>
            );
          })}
      </div>
    </Sheet>
  );
}

function PinSetupSheet({ hasPin, onClose, onDone }: { hasPin: boolean; onClose: () => void; onDone: (has: boolean) => void }) {
  type Step = 'current' | 'new' | 'confirm';
  const [step, setStep] = useState<Step>(hasPin ? 'current' : 'new');
  const [current, setCurrent] = useState('');
  const [first, setFirst] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const fail = (e: ApiError) => {
    setError(e.message);
    setStep(hasPin ? 'current' : 'new');
  };
  const input = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 4);
    setValue(v);
    setError(null);
    if (v.length < 4) return;
    setValue('');
    if (step === 'current') {
      if (removing) {
        api.setPin(null, v).then(() => onDone(false), fail);
        return;
      }
      setCurrent(v);
      setStep('new');
    } else if (step === 'new') {
      setFirst(v);
      setStep('confirm');
    } else if (v !== first) {
      setError('Les deux codes ne correspondent pas.');
      setStep('new');
    } else {
      api.setPin(v, current || undefined).then(() => onDone(true), fail);
    }
  };
  const label = step === 'current' ? 'Code actuel' : step === 'new' ? 'Nouveau code (4 chiffres)' : 'Confirmez le nouveau code';
  return (
    <Sheet title="Contrôle parental" onClose={onClose}>
      <p class="m-muted">{label}</p>
      <PinInput value={value} onInput={input} />
      {error && <p class="m-error">{error}</p>}
      {hasPin && !removing && (
        <button
          class="m-btn m-danger"
          onClick={() => {
            setRemoving(true);
            setStep('current');
            setValue('');
          }}
        >
          Supprimer le code
        </button>
      )}
    </Sheet>
  );
}

function UnlinkSheet({ onClose }: { onClose: () => void }) {
  const app = useMobile();
  const [busy, setBusy] = useState(false);
  const unlink = () => {
    setBusy(true);
    // Même si l'appel échoue (hors ligne), on oublie le token localement.
    api
      .unlink()
      .catch(() => undefined)
      .then(() => {
        storage.setToken(null);
        app.reset();
      });
  };
  return (
    <Sheet title="Délier cet appareil ?" onClose={onClose}>
      <p class="m-muted">Il faudra le lier à nouveau depuis le dashboard pour le réutiliser.</p>
      <div class="m-actions">
        <button class="m-btn" onClick={onClose}>
          Annuler
        </button>
        <button class="m-btn m-btn-danger" disabled={busy} onClick={unlink}>
          {busy ? 'Déliaison…' : 'Délier'}
        </button>
      </div>
    </Sheet>
  );
}
