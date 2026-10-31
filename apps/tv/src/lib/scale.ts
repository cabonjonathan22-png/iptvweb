import { flags } from './devflags';

/**
 * L'interface est conçue en 1920×1080 puis réduite par un transform global.
 * Beaucoup de navigateurs TV rapportent 1280×720 (voire 960×540) : un seul
 * jeu de cotes, aucune media query, et un rendu identique partout.
 */
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

/** Transformation courante scène -> pixels réels (utilisée pour placer la vidéo). */
export const stage = { s: 1, ox: 0, oy: 0, vw: DESIGN_W, vh: DESIGN_H };
const listeners: Array<() => void> = [];

export function onScaleChange(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function applyScale(stageEl: HTMLElement, frame: HTMLElement) {
  const update = () => {
    const vw = flags.tvFrame ? 1280 : window.innerWidth;
    const vh = flags.tvFrame ? 720 : window.innerHeight;
    const s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    frame.style.width = vw + 'px';
    frame.style.height = vh + 'px';
    // Centrage si le ratio de l'écran n'est pas 16:9.
    const ox = (vw - DESIGN_W * s) / 2;
    const oy = (vh - DESIGN_H * s) / 2;
    const t = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
    stageEl.style.webkitTransform = t;
    stageEl.style.transform = t;
    stage.s = s;
    stage.ox = ox;
    stage.oy = oy;
    stage.vw = vw;
    stage.vh = vh;
    for (let i = 0; i < listeners.length; i++) listeners[i]!();
  };
  update();
  window.addEventListener('resize', update);
}
