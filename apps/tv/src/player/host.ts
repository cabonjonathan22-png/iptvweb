/**
 * Couche vidéo : l'unique <video> vit HORS de la scène mise à l'échelle (le
 * transform CSS d'un parent dégrade fortement la lecture sur les TV) et est
 * positionné en pixels réels à partir des coordonnées 1080p demandées.
 * La scène, transparente là où il faut, est superposée par-dessus.
 */
import { player } from './engine';
import { onScaleChange, stage } from '../lib/scale';

export function mountVideoLayer(frame: HTMLElement): void {
  const layer = document.createElement('div');
  layer.id = 'video-layer';
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('preload', 'auto');
  video.setAttribute('x-webkit-airplay', 'allow');
  layer.appendChild(video);
  frame.insertBefore(layer, frame.firstChild);
  player.attach(video);

  const place = () => {
    const v = player.view;
    const st = layer.style;
    if (v.mode === 'hidden' || !player.src) {
      st.visibility = 'hidden';
      st.left = st.top = '0px';
      st.width = st.height = '1px';
      return;
    }
    st.visibility = 'visible';
    if (v.mode === 'full') {
      st.left = st.top = '0px';
      st.width = stage.vw + 'px';
      st.height = stage.vh + 'px';
    } else {
      st.left = Math.round(stage.ox + v.x * stage.s) + 'px';
      st.top = Math.round(stage.oy + v.y * stage.s) + 'px';
      st.width = Math.round(v.w * stage.s) + 'px';
      st.height = Math.round(v.h * stage.s) + 'px';
    }
  };
  player.subscribe(place);
  onScaleChange(place);
  place();
}
