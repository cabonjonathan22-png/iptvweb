/**
 * Type d'appareil. La même app sert les TV (télécommande) et les navigateurs de
 * PC / téléphone (souris, tactile) ; seul le mode « pointeur » ajoute des
 * contrôles à l'écran. Le clavier et la navigation spatiale restent actifs partout.
 * Forçage possible : ?device=tv | desktop | mobile.
 */
export type DeviceKind = 'tv' | 'desktop' | 'mobile';

const TV_UA =
  /smart-?tv|vidaa|hisense|hbbtv|tizen|web0s|webos|netcast|viera|bravia|philipstv|appletv|googletv|android tv|\baftt?\w*\b|crkey|roku|tv safari|large screen/i;
const MOBILE_UA = /android|iphone|ipad|ipod|mobile|silk/i;

export function detectDevice(ua: string, opts: { touch?: boolean; forced?: string | null } = {}): DeviceKind {
  if (opts.forced === 'tv' || opts.forced === 'desktop' || opts.forced === 'mobile') return opts.forced;
  if (TV_UA.test(ua)) return 'tv';
  // iPadOS se présente comme un Mac : on le reconnaît au tactile.
  if (MOBILE_UA.test(ua) || (opts.touch && /macintosh/i.test(ua))) return 'mobile';
  return 'desktop';
}

function readForced(): string | null {
  const m = /[?&]device=(tv|desktop|mobile)/.exec(window.location.search);
  try {
    if (m) window.sessionStorage.setItem('oria.device', m[1]!);
    return m ? m[1]! : window.sessionStorage.getItem('oria.device');
  } catch (_) {
    return m ? m[1]! : null;
  }
}

/** ?tv=1 simule une TV (mode de test sur desktop). */
const simulatedTv = /[?&]tv=1/.test(window.location.search);

export const device: DeviceKind = detectDevice(navigator.userAgent || '', {
  touch: (navigator.maxTouchPoints || 0) > 1,
  forced: simulatedTv ? 'tv' : readForced(),
});

export const isPointerDevice = device !== 'tv';

/** iPadOS se présente comme un Mac : on le reconnaît au tactile. */
export const isIOS =
  /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (/macintosh/i.test(navigator.userAgent || '') && (navigator.maxTouchPoints || 0) > 1);

const NARROW = 900;
export const isNarrow = () => window.innerWidth < NARROW;

/**
 * Interface tactile (onglets, défilement natif) ou scène de la TV. Un PC dans
 * une fenêtre étroite prend aussi l'interface tactile, sauf ?device=desktop.
 */
export const touchUi = device === 'mobile' || (device === 'desktop' && readForced() !== 'desktop' && isNarrow());

export function toggleFullscreen() {
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement || d.webkitFullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => undefined);
    else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
  } else if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}
