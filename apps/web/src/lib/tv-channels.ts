import { and, eq, type SQL } from 'drizzle-orm';
import type { PosterCard, TvChannel } from '@iptv/shared';
import { schema } from './db';
import { imageUrl } from './images';
import { visibleCategory } from './tv-api';

const ch = schema.channels;

export const channelColumns = {
  id: ch.id,
  num: ch.num,
  name: ch.name,
  logo: ch.logo,
  epgId: ch.epgChannelId,
  catchup: ch.catchup,
};

/** Chaînes visibles d'une playlist (LEFT JOIN categories requis). */
export function visibleChannels(playlistId: string, lockedOk: boolean, extra?: SQL): SQL {
  return and(eq(ch.playlistId, playlistId), visibleCategory(ch.categoryId, lockedOk), extra)!;
}

export function toTvChannel(
  r: { id: number; num: number | null; name: string; logo: string | null; epgId: string | null; catchup: string | null },
  origin: string,
): TvChannel {
  return {
    id: r.id,
    num: r.num,
    name: r.name,
    logo: imageUrl(origin, r.logo, 'logo', 96),
    epgId: r.epgId,
    catchup: !!r.catchup,
  };
}

export function toPoster(
  r: { id: number; name: string; poster: string | null; year: number | null; rating: number | null },
  origin: string,
): PosterCard {
  return { id: r.id, name: r.name, poster: imageUrl(origin, r.poster, 'poster', 240), year: r.year, rating: r.rating };
}
