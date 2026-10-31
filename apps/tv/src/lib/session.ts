import type { TvSettings } from '@iptv/shared';

/**
 * État de session en mémoire : réglages du compte (chargés au démarrage) et
 * jeton de déverrouillage parental (jamais persisté : redemandé après 1 h ou
 * au redémarrage de l'app).
 */
export const session = {
  settings: {
    audioLang: null,
    subtitleLang: null,
    playerMode: 'auto',
    livePreview: true,
    hasPin: false,
    contentLangs: [],
  } as TvSettings,
  unlock: null as string | null,
  unlockUntil: 0,
};

/** Marge de 5 min sur la durée de validité serveur (1 h). */
const UNLOCK_MS = 55 * 60_000;

export function setUnlock(token: string) {
  session.unlock = token;
  session.unlockUntil = Date.now() + UNLOCK_MS;
}

export function getUnlock(): string | null {
  return session.unlock && Date.now() < session.unlockUntil ? session.unlock : null;
}

/** Faut-il demander le PIN avant d'ouvrir un contenu verrouillé ? */
export function needsPin(locked: boolean): boolean {
  return locked && session.settings.hasPin && !getUnlock();
}
