import { render } from 'preact';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import './player.css';
import './screens.css';
import { App } from './app';
import { applyScale } from './lib/scale';
import { flags, startCpuThrottle } from './lib/devflags';
import { mountVideoLayer } from './player/host';
import { device, isNarrow, isPointerDevice, touchUi } from './lib/device';
import './lib/install';
import { installPointerGestures } from './nav/pointer';
import { initCast } from './player/cast';
import { player } from './player/engine';

const root = document.getElementById('root')!;
document.documentElement.className += ' device-' + device + (touchUi ? ' ui-touch' : '') + (flags.tvFrame ? ' tv-frame' : '');

if (touchUi) {
  // Chunk à part : les TV ne téléchargent jamais l'interface tactile.
  import('./mobile/boot').then((m) => m.boot(root));
} else {
  root.innerHTML = '<div id="frame"><div id="stage"></div></div>';
  const frame = document.getElementById('frame')!;
  const stage = document.getElementById('stage')!;
  applyScale(stage, frame);
  mountVideoLayer(frame);
  if (flags.slow) startCpuThrottle();
  // Aussi sur TV : les télécommandes à pointeur et les souris USB ont une molette.
  installPointerGestures(frame);
  if (isPointerDevice) initCast();
  render(<App />, stage);
}

// PC : la fenêtre passe d'étroite à large ou l'inverse, on change d'interface (sauf en pleine lecture).
if (device === 'desktop') {
  window.addEventListener('resize', () => {
    if (isNarrow() !== touchUi && !player.src && !/[?&]device=/.test(window.location.search)) window.location.reload();
  });
}
