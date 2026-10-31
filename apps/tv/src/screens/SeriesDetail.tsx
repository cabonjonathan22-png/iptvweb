import { useEffect, useState } from 'preact/hooks';
import type { Episode, SeriesDetail } from '@iptv/shared';
import { useApp } from '../app-context';
import { api, ApiError } from '../lib/api';
import { duration } from '../lib/format';
import { Button } from '../components/Button';
import { Img } from '../components/Img';
import { ProgressBar, progressRatio } from '../components/Cards';
import { ScreenHeader } from '../components/ScreenHeader';
import { VirtualList } from '../components/VirtualList';
import { PinDialog } from '../components/PinDialog';
import { VodPlayer, type VodItem } from '../player/VodPlayer';

const EP_ROW = 150;

const epLabel = (e: Episode) => 'S' + e.season + ' · E' + e.episode;

/** Fiche série : infos, sélecteur de saison, liste des épisodes (progression), épisode suivant auto. */
export function SeriesDetailScreen({ params }: { params?: Record<string, unknown> }) {
  const app = useApp();
  const id = Number(params && params.id);
  const [s, setS] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState(false);
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [epIdx, setEpIdx] = useState(0);
  const [playing, setPlaying] = useState<Episode | null>(null);

  const load = (initial: boolean) =>
    api
      .series(id)
      .then((r) => {
        setS(r);
        setError(null);
        if (initial && r.resume) {
          // Positionne la saison / l'épisode à reprendre.
          r.seasons.forEach((se, si) =>
            se.episodes.forEach((e, ei) => {
              if (e.id === r.resume!.episodeId) {
                setSeasonIdx(si);
                setEpIdx(ei);
              }
            }),
          );
        }
      })
      .catch((e: ApiError) => {
        if (e.status === 403 && e.code === 'locked') setPin(true);
        else if (e.status !== 401) setError(e.message);
      });
  useEffect(() => {
    load(true);
  }, [id]);

  if (pin) return <PinDialog onClose={() => app.back()} onUnlocked={() => (setPin(false), load(true))} />;

  const all: Episode[] = s ? s.seasons.reduce((acc: Episode[], se) => acc.concat(se.episodes), []) : [];
  const toItem = (e: Episode, startAt = 0): VodItem => ({
    kind: 'episode',
    id: e.id,
    title: s ? s.name : '',
    subtitle: epLabel(e) + (e.title ? ' · ' + e.title : ''),
    startAt,
  });
  const resumeOf = (e: Episode) => (e.progress && !e.progress.completed && e.progress.position > 30 ? e.progress.position : 0);

  if (playing && s) {
    const i = all.findIndex((e) => e.id === playing.id);
    const next = all[i + 1] || null;
    return (
      <VodPlayer
        key={playing.id}
        item={toItem(playing, resumeOf(playing))}
        next={next ? toItem(next) : null}
        onPlayNext={() => next && setPlaying({ ...next, progress: null })}
        onExit={() => {
          setPlaying(null);
          load(false);
        }}
      />
    );
  }

  if (error || !s) {
    return (
      <div class="screen">
        <ScreenHeader title="Séries" backHint="Retour" />
        {error ? <p class="hero-sub">{error}</p> : <div class="detail-skeleton skeleton" />}
      </div>
    );
  }

  const season = s.seasons[seasonIdx];
  const episodes = season ? season.episodes : [];
  const resumeEp = s.resume ? all.find((e) => e.id === s.resume!.episodeId) : all[0];
  const toggleFav = () => {
    const on = !s.favorite;
    setS({ ...s, favorite: on });
    api.setFavorite('series', s.id, on).catch(() => undefined);
  };

  return (
    <div class="screen detail">
      {s.backdrop && <Img src={s.backdrop} name={s.name} class="detail-backdrop" />}
      <div class="detail-shade" />
      <ScreenHeader title="Séries" backHint="Retour" />
      <div class="series-layout">
        <div class="series-side">
          <h1 class="detail-title">{s.name}</h1>
          <p class="detail-meta">{[s.year, s.rating ? '★ ' + s.rating : null, s.genre].filter(Boolean).join('  ·  ')}</p>
          {s.plot && <p class="detail-plot clamp">{s.plot}</p>}
          <div class="row-actions">
            {resumeEp && (
              <Button id="s-play" variant="primary" autoFocus onSelect={() => setPlaying(resumeEp)}>
                ▶ {s.resume && s.resume.position > 0 ? 'Reprendre' : 'Lecture'} {epLabel(resumeEp)}
              </Button>
            )}
            <Button id="s-fav" onSelect={toggleFav}>
              {s.favorite ? '♥' : '♡'}
            </Button>
          </div>
          {s.seasons.length > 1 && (
            <div class="chips season-chips">
              {s.seasons.map((se, i) => (
                <Button
                  key={se.season}
                  id={'season-' + se.season}
                  variant={i === seasonIdx ? 'primary' : 'ghost'}
                  onSelect={() => {
                    setSeasonIdx(i);
                    setEpIdx(0);
                  }}
                  onFocus={() => {
                    setSeasonIdx(i);
                    setEpIdx(0);
                  }}
                >
                  Saison {se.season}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div class="series-episodes">
          {episodes.length ? (
            <VirtualList
              id={'eps-' + seasonIdx}
              count={episodes.length}
              rowHeight={EP_ROW}
              height={760}
              index={Math.min(epIdx, episodes.length - 1)}
              onIndex={setEpIdx}
              onSelect={(i) => setPlaying(episodes[i]!)}
              renderRow={(i) => {
                const e = episodes[i]!;
                return (
                  <div class="ep-row">
                    <div class="ep-thumb-wrap">
                      <Img key={e.thumb || e.id} src={e.thumb} name={s.name} class="ep-thumb" />
                      {e.progress && <ProgressBar value={e.progress.completed ? 1 : progressRatio(e.progress)} />}
                    </div>
                    <div class="ep-info">
                      <span class="ep-title">
                        {e.episode}. {e.title || 'Épisode ' + e.episode}
                      </span>
                      <span class="small">
                        {duration(e.durationSec)}
                        {e.progress && e.progress.completed ? '  ·  ✓ Vu' : ''}
                      </span>
                      {e.plot && <span class="ep-plot">{e.plot}</span>}
                    </div>
                  </div>
                );
              }}
            />
          ) : (
            <p class="empty">Aucun épisode disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}
