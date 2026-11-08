import { device, isIOS } from './device';
import { storage } from './storage';

/**
 * Installation en web app sur téléphone et tablette. Android propose l'invite
 * native (événement à capturer tôt, d'où ce module chargé au démarrage) ; iOS
 * n'en a pas : on y explique le menu Partager.
 */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const DISMISSED = 'installDismissed';
let deferred: InstallEvent | null = null;
const listeners: Array<() => void> = [];
const emit = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  // Sur PC, Chrome garde son propre bouton d'installation.
  if (device !== 'mobile') return;
  e.preventDefault();
  deferred = e as InstallEvent;
  emit();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  emit();
});

export function onInstallChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export const isInstalled = () =>
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  !!(navigator as Navigator & { standalone?: boolean }).standalone;

export const hasNativePrompt = () => !!deferred;

/** Bannière d'accueil : seulement si on sait installer et que l'utilisateur n'a pas refusé. */
export const shouldSuggestInstall = () =>
  device === 'mobile' && !isInstalled() && (!!deferred || isIOS) && !storage.getPref(DISMISSED, false);

export const dismissInstall = () => {
  storage.setPref(DISMISSED, true);
  emit();
};

export function promptInstall(): Promise<void> {
  const e = deferred;
  if (!e) return Promise.resolve();
  return e.prompt().then(() =>
    e.userChoice.then(() => {
      // L'invite ne peut servir qu'une fois.
      deferred = null;
      emit();
    }),
  );
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
