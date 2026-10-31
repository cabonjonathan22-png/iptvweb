import type { PosterCard as Poster, Progress, TvChannel } from '@iptv/shared';
import { Img } from './Img';

export function ProgressBar({ value }: { value: number }) {
  return (
    <div class="pbar">
      <div class="pbar-fill" style={{ transform: 'scaleX(' + Math.max(0, Math.min(1, value)) + ')' }} />
    </div>
  );
}

export const progressRatio = (p: Progress | null | undefined) =>
  p && p.duration ? Math.min(1, p.position / p.duration) : 0;

/** Jaquette 2:3 (films, séries). */
export function PosterTile({ item }: { item: Poster | undefined }) {
  if (!item) return <div class="card poster skeleton" />;
  return (
    <div class="card poster">
      <Img key={item.poster || item.id} src={item.poster} name={item.name} class="poster-img" />
      <div class="card-caption">
        <span class="card-title">{item.name}</span>
        {(item.year || item.rating) && (
          <span class="card-meta">
            {item.year || ''}
            {item.rating ? ' · ★ ' + item.rating : ''}
          </span>
        )}
      </div>
    </div>
  );
}

/** Carte 16:9 (reprise de lecture, épisodes). */
export function WideTile({ image, title, subtitle, progress }: { image: string | null; title: string; subtitle?: string | null; progress?: number }) {
  return (
    <div class="card wide">
      <Img key={image || title} src={image} name={title} class="wide-img" />
      {progress !== undefined && progress > 0 && <ProgressBar value={progress} />}
      <div class="card-caption">
        <span class="card-title">{title}</span>
        {subtitle && <span class="card-meta">{subtitle}</span>}
      </div>
    </div>
  );
}

/** Tuile chaîne (logo + nom). */
export function ChannelTile({ ch }: { ch: TvChannel }) {
  return (
    <div class="card chan">
      <Img key={ch.logo || ch.id} src={ch.logo} name={ch.name} class="chan-img" />
      <span class="card-title">
        {ch.num !== null ? ch.num + '  ' : ''}
        {ch.name}
      </span>
    </div>
  );
}
