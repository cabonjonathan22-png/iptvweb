import { useEffect, useState } from 'preact/hooks';
import type { MovieDetail } from '@iptv/shared';
import { useApp } from '../app-context';
import { api, ApiError } from '../lib/api';
import { duration } from '../lib/format';
import { localPosition } from '../lib/local-progress';
import { Button } from '../components/Button';
import { Img } from '../components/Img';
import { ProgressBar, progressRatio } from '../components/Cards';
import { ScreenHeader } from '../components/ScreenHeader';
import { PinDialog } from '../components/PinDialog';
import { VodPlayer, type VodItem } from '../player/VodPlayer';

/** Fiche film : fond, affiche, synopsis, infos, Lecture / Reprendre, favori. */
export function MovieDetailScreen({ params }: { params?: Record<string, unknown> }) {
  const app = useApp();
  const id = Number(params && params.id);
  const [m, setM] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState(false);
  const [playing, setPlaying] = useState<VodItem | null>(null);

  const load = () =>
    api
      .movie(id)
      .then((r) => {
        setM(r);
        setError(null);
      })
      .catch((e: ApiError) => {
        if (e.status === 403 && e.code === 'locked') setPin(true);
        else if (e.status !== 401) setError(e.message);
      });
  useEffect(() => {
    load();
  }, [id]);

  if (pin) return <PinDialog onClose={() => app.back()} onUnlocked={() => (setPin(false), load())} />;
  if (playing) {
    return (
      <VodPlayer
        item={playing}
        onExit={() => {
          setPlaying(null);
          load(); // rafraîchit la position de reprise
        }}
      />
    );
  }

  if (error || !m) {
    return (
      <div class="screen">
        <ScreenHeader title="Films" backHint="Retour" />
        {error ? <p class="hero-sub">{error}</p> : <div class="detail-skeleton skeleton" />}
      </div>
    );
  }

  const resumeAt = m.progress && !m.progress.completed ? m.progress.position : localPosition('vod', m.id);
  const canResume = !!resumeAt && resumeAt > 30;
  const toggleFav = () => {
    const on = !m.favorite;
    setM({ ...m, favorite: on });
    api.setFavorite('vod', m.id, on).catch(() => setM({ ...m, favorite: !on }));
  };
  const play = (startAt: number) => setPlaying({ kind: 'vod', id: m.id, title: m.name, startAt });

  return (
    <div class="screen detail">
      {m.backdrop && <Img src={m.backdrop} name={m.name} class="detail-backdrop" />}
      <div class="detail-shade" />
      <ScreenHeader title="Films" backHint="Retour" />
      <div class="detail-body">
        <Img src={m.poster} name={m.name} class="detail-poster" />
        <div class="detail-info">
          <h1 class="detail-title">{m.name}</h1>
          <p class="detail-meta">
            {[m.year, duration(m.durationSec), m.rating ? '★ ' + m.rating : null, m.genre].filter(Boolean).join('  ·  ')}
          </p>
          {canResume && m.progress && <ProgressBar value={progressRatio(m.progress)} />}
          {m.plot && <p class="detail-plot">{m.plot}</p>}
          {m.director && <p class="detail-credits"><span>Réalisation</span> {m.director}</p>}
          {m.cast && <p class="detail-credits"><span>Avec</span> {m.cast}</p>}
          {m.containerExt === 'mkv' && <p class="small">Format MKV : la lecture dépend du navigateur de votre TV.</p>}
          <div class="row-actions">
            {canResume ? (
              <>
                <Button id="m-resume" variant="primary" autoFocus onSelect={() => play(resumeAt!)}>
                  ▶ Reprendre
                </Button>
                <Button id="m-start" onSelect={() => play(0)}>
                  Depuis le début
                </Button>
              </>
            ) : (
              <Button id="m-play" variant="primary" autoFocus onSelect={() => play(0)}>
                ▶ Lecture
              </Button>
            )}
            <Button id="m-fav" onSelect={toggleFav}>
              {m.favorite ? '♥ Dans mes favoris' : '♡ Favori'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
