import type { PlayResponse } from '@iptv/shared';
import type { Source } from '../player/engine';
import { api } from './api';
import { isIOS } from './device';
import { prefs } from './prefs';
import { storage } from './storage';

const REMEMBERED = 'liveFormat';
type Format = 'hls' | 'ts';
type Fetch = (mode: Format | undefined, relay: 'backup' | undefined) => Promise<PlayResponse>;

const toSource = (r: PlayResponse) => ({ url: r.url, type: r.type, remux: r.remux });

/**
 * Sources de secours, essayées dans l'ordre par le lecteur en cas d'échec : autre
 * format (direct), puis relais de secours. Le relais principal (Cloudflare) ne
 * coûte rien ; le secours (Render) n'est utilisé que si nécessaire.
 */
export function withFallback(fetch: Fetch, mode: Format | undefined, otherFormat: boolean): Pick<Source, 'alternate'> {
  const other: Format = mode === 'ts' ? 'hls' : 'ts';
  const steps: [Format | undefined, 'backup' | undefined][] = otherFormat
    ? [[other, undefined], [mode, 'backup'], [other, 'backup']]
    : [[mode, 'backup']];
  let i = 0;
  return {
    alternate: () => {
      const [m, relay] = steps[i % steps.length]!;
      i++;
      return fetch(m, relay).then(toSource);
    },
  };
}

/** Source d'une chaîne ; le format qui a fonctionné sert d'emblée pour les suivantes. */
export function liveSource(channelId: number): Promise<Source> {
  // Sans MSE, l'iPhone ne lit que le HLS.
  const forced: Format | null = prefs.liveMode !== 'auto' ? prefs.liveMode : isIOS ? 'hls' : null;
  const mode: Format | undefined = forced || storage.getPref<Format | undefined>(REMEMBERED, undefined);
  const fetch: Fetch = (m, relay) => api.play('live', channelId, m, relay);
  return fetch(mode, undefined).then((r) => ({
    ...toSource(r),
    live: true,
    ...withFallback(fetch, mode, !forced),
    onPlaying: (type: Source['type']) => {
      if (!forced && (type === 'hls' || type === 'ts') && storage.getPref<Format | undefined>(REMEMBERED, undefined) !== type) storage.setPref(REMEMBERED, type);
    },
  }));
}
