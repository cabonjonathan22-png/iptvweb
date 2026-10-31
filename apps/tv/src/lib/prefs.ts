import { api } from './api';
import { session } from './session';

/**
 * Préférences de lecture : stockées sur le compte (partagées entre les TV),
 * lues depuis la session. Les modifications partent au serveur en arrière-plan.
 */
export type LiveMode = 'auto' | 'hls' | 'ts';

const save = (patch: Parameters<typeof api.saveSettings>[0]) => {
  api.saveSettings(patch).catch(() => undefined);
};

export const prefs = {
  get preview(): boolean {
    return session.settings.livePreview;
  },
  set preview(v: boolean) {
    session.settings.livePreview = v;
    save({ livePreview: v });
  },
  get liveMode(): LiveMode {
    return session.settings.playerMode;
  },
  set liveMode(v: LiveMode) {
    session.settings.playerMode = v;
    save({ playerMode: v });
  },
};
