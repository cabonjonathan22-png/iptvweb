/**
 * Mapping CENTRALISÉ des touches de télécommande.
 * Pour calibrer une nouvelle TV : ouvrir l'écran « Debug touches »
 * (séquence ↑ ↑ ↓ ↓ ← → ← →, ou Réglages > Debug touches) et compléter ici.
 */

export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'digit'
  | 'chUp'
  | 'chDown'
  | 'play'
  | 'pause'
  | 'playPause'
  | 'stop'
  | 'ff'
  | 'rw'
  | 'info';

export interface KeyAction {
  action: Action;
  /** 0-9 pour action === 'digit'. */
  digit?: number;
  /** true si la touche est maintenue (auto-repeat). */
  repeat: boolean;
}

const BY_CODE: { [code: number]: Action } = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'ok',
  // Retour : Backspace / Échap (desktop), WebOS (461), Tizen (10009).
  8: 'back',
  27: 'back',
  461: 'back',
  10009: 'back',
  // Touches couleur (norme HbbTV / VIDAA).
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',
  // CH+ / CH- (VIDAA 427/428, et PageUp/PageDown sur certains modèles et au clavier).
  427: 'chUp',
  428: 'chDown',
  33: 'chUp',
  34: 'chDown',
  // Lecture.
  415: 'play',
  19: 'pause',
  10252: 'playPause',
  179: 'playPause',
  413: 'stop',
  417: 'ff',
  412: 'rw',
  457: 'info',
};

/** Fallback sur `event.key` pour les navigateurs qui n'envoient pas de keyCode utile. */
const BY_KEY: { [key: string]: Action } = {
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  Left: 'left',
  Up: 'up',
  Right: 'right',
  Down: 'down',
  Enter: 'ok',
  Backspace: 'back',
  Escape: 'back',
  GoBack: 'back',
  BrowserBack: 'back',
  ColorF0Red: 'red',
  ColorF1Green: 'green',
  ColorF2Yellow: 'yellow',
  ColorF3Blue: 'blue',
  ChannelUp: 'chUp',
  ChannelDown: 'chDown',
  PageUp: 'chUp',
  PageDown: 'chDown',
  MediaPlay: 'play',
  MediaPause: 'pause',
  MediaPlayPause: 'playPause',
  MediaStop: 'stop',
  MediaFastForward: 'ff',
  MediaRewind: 'rw',
  Info: 'info',
};

export function mapKey(e: KeyboardEvent): KeyAction | null {
  const code = e.keyCode || e.which;
  const repeat = !!e.repeat;
  // Chiffres : rangée principale (48-57) et pavé numérique (96-105).
  if (code >= 48 && code <= 57) return { action: 'digit', digit: code - 48, repeat };
  if (code >= 96 && code <= 105) return { action: 'digit', digit: code - 96, repeat };
  const byCode = BY_CODE[code];
  if (byCode) return { action: byCode, repeat };
  const byKey = e.key ? BY_KEY[e.key] : undefined;
  if (byKey) return { action: byKey, repeat };
  if (e.key && e.key.length === 1 && e.key >= '0' && e.key <= '9') {
    return { action: 'digit', digit: e.key.charCodeAt(0) - 48, repeat };
  }
  return null;
}

/** Séquence d'accès à l'écran caché « Debug touches ». */
export const DEBUG_SEQUENCE: Action[] = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];
