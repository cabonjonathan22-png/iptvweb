/**
 * Mode « TV sur desktop » (ajouter à l'URL) :
 *   ?tv=1    -> rend l'app dans un cadre 1280×720, comme la plupart des navigateurs TV
 *   ?slow=1  -> simule une TV bas de gamme : latence réseau +1,2 s et CPU bridé
 *   ?hlsjs=1 -> ignore le HLS natif du navigateur et force hls.js (comme sur la plupart des TV)
 * Les flags sont mémorisés pour la session (sessionStorage).
 */

function readFlag(name: string): boolean {
  const m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  try {
    if (m) window.sessionStorage.setItem('oria.flag.' + name, m[1]!);
    return (m ? m[1] : window.sessionStorage.getItem('oria.flag.' + name)) === '1';
  } catch (_) {
    return !!m && m[1] === '1';
  }
}

export const flags = {
  tvFrame: readFlag('tv'),
  slow: readFlag('slow'),
  forceHlsJs: readFlag('hlsjs'),
};

export const SLOW_NETWORK_DELAY_MS = 1200;

/** Occupe le thread principal ~20 ms par frame pour reproduire un CPU de TV. */
export function startCpuThrottle() {
  const loop = () => {
    const end = Date.now() + 20;
    while (Date.now() < end) {
      /* spin */
    }
    window.requestAnimationFrame(loop);
  };
  window.requestAnimationFrame(loop);
}
