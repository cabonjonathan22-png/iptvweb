import { render } from 'preact';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import './player.css';
import { App } from './app';
import { applyScale } from './lib/scale';
import { flags, startCpuThrottle } from './lib/devflags';
import { mountVideoLayer } from './player/host';

const root = document.getElementById('root')!;
root.innerHTML = '<div id="frame"><div id="stage"></div></div>';
const frame = document.getElementById('frame')!;
const stage = document.getElementById('stage')!;
if (flags.tvFrame) document.documentElement.className += ' tv-frame';
applyScale(stage, frame);
mountVideoLayer(frame);
if (flags.slow) startCpuThrottle();

render(<App />, stage);
