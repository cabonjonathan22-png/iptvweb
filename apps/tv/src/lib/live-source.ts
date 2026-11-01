import type { PlayResponse } from '@iptv/shared';
import type { Source } from '../player/engine';
import { api } from './api';
import { isIOS } from './device';
import { prefs } from './prefs';
import { storage } from './storage';

const REMEMBERED = 'liveFormat';
type Format = 'hls' | 'ts';

/**
 * Source d'une chaîne. En automatique, le lecteur peut essayer l'autre format si
 * le premier échoue, et celui qui a fonctionné sert d'emblée pour les chaînes
 * suivantes : le zapping ne repaie pas l'échec à chaque fois.
 */
export function liveSource(channelId: number): Promise<Source> {
  // Sans MSE, l'iPhone ne lit que le HLS.
  const forced: Format | null = prefs.liveMode !== 'auto' ? prefs.liveMode : isIOS ? 'hls' : null;
  let mode: Format | undefined = forced || storage.getPref<Format | undefined>(REMEMBERED, undefined);
  const toSource = (r: PlayResponse) => ({ url: r.url, type: r.type });
  return api.play('live', channelId, mode).then((r) => ({
    ...toSource(r),
    live: true,
    ...(forced
      ? {}
      : {
          alternate: () => {
            mode = mode === 'ts' ? 'hls' : 'ts';
            return api.play('live', channelId, mode).then(toSource);
          },
          onPlaying: (type: Source['type']) => {
            if ((type === 'hls' || type === 'ts') && storage.getPref<Format | undefined>(REMEMBERED, undefined) !== type) storage.setPref(REMEMBERED, type);
          },
        }),
  }));
}
