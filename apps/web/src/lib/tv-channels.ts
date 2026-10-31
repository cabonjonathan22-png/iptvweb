import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import type { TvChannel } from '@iptv/shared';
import { schema } from './db';
import { imageUrl } from './images';

const ch = schema.channels;
const c = schema.categories;

export const channelColumns = {
  id: ch.id,
  num: ch.num,
  name: ch.name,
  logo: ch.logo,
  epgId: ch.epgChannelId,
  catchup: ch.catchup,
};

/** Chaînes d'une playlist dont la catégorie n'est pas masquée (les sans-catégorie restent visibles). */
export function visibleChannels(playlistId: string, extra?: SQL): SQL {
  return and(eq(ch.playlistId, playlistId), or(isNull(ch.categoryId), eq(c.hidden, false)), extra)!;
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
