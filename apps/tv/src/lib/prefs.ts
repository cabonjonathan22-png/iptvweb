import { storage } from './storage';

/** Préférences locales de la TV (les réglages de compte arrivent à l'étape 9). */
export type LiveMode = 'auto' | 'hls' | 'ts';

export const prefs = {
  get preview(): boolean {
    return storage.getPref('preview', true);
  },
  set preview(v: boolean) {
    storage.setPref('preview', v);
  },
  get liveMode(): LiveMode {
    return storage.getPref<LiveMode>('liveMode', 'auto');
  },
  set liveMode(v: LiveMode) {
    storage.setPref('liveMode', v);
  },
};
