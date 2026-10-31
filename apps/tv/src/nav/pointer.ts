/**
 * Souris, télécommande à pointeur et tactile : la molette et les glissements sont traduits en flèches.
 * Listes, grilles, rangées et lecteur (zapping, avance rapide) réagissent donc
 * exactement comme à la télécommande, sans logique dédiée à chaque composant.
 */
import { sendKey } from './hooks';
import type { Action } from './keys';

const WHEEL_STEP = 80;
const SWIPE_STEP = 40;
const STEP_MS = 40;
/** File courte : la liste s'arrête dès que le geste s'arrête. */
const MAX_QUEUE = 3;
/** Après ce silence, la molette repart de zéro. */
const WHEEL_IDLE_MS = 250;
/** Fin d'inertie des pavés tactiles et des télécommandes à pointeur. */
const WHEEL_MIN_DELTA = 4;

const queue: Action[] = [];
let timer = 0;
function enqueue(a: Action) {
  // Changement de sens : on oublie les pas encore en attente.
  if (queue.length && queue[queue.length - 1] !== a) queue.length = 0;
  if (queue.length < MAX_QUEUE) queue.push(a);
  if (timer) return;
  const run = () => {
    const next = queue.shift();
    if (!next) {
      timer = 0;
      return;
    }
    sendKey(next);
    timer = window.setTimeout(run, STEP_MS);
  };
  run();
}

export function installPointerGestures(el: HTMLElement) {
  let ax = 0;
  let ay = 0;
  let lastWheel = 0;
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // Selon le navigateur, le défilement est exprimé en pixels, en lignes ou en pages.
      const unit = e.deltaMode === 1 ? WHEEL_STEP / 3 : e.deltaMode === 2 ? WHEEL_STEP * 3 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (Math.abs(dx) < WHEEL_MIN_DELTA && Math.abs(dy) < WHEEL_MIN_DELTA) return;
      const now = Date.now();
      if (now - lastWheel > WHEEL_IDLE_MS || (dy > 0) !== (ay > 0)) {
        ax = 0;
        ay = 0;
      }
      lastWheel = now;
      ax += dx;
      ay += dy;
      while (Math.abs(ay) >= WHEEL_STEP) {
        enqueue(ay > 0 ? 'down' : 'up');
        ay -= ay > 0 ? WHEEL_STEP : -WHEEL_STEP;
      }
      while (Math.abs(ax) >= WHEEL_STEP) {
        enqueue(ax > 0 ? 'right' : 'left');
        ax -= ax > 0 ? WHEEL_STEP : -WHEEL_STEP;
      }
    },
    { passive: false },
  );

  let x = 0;
  let y = 0;
  el.addEventListener(
    'touchstart',
    (e) => {
      x = e.touches[0]!.clientX;
      y = e.touches[0]!.clientY;
    },
    { passive: true },
  );
  el.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      const t = e.touches[0]!;
      const dx = t.clientX - x;
      const dy = t.clientY - y;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const d = horizontal ? dx : dy;
      if (Math.abs(d) < SWIPE_STEP) return;
      // Le contenu suit le doigt : glisser vers le haut descend dans la liste.
      const action: Action = horizontal ? (d < 0 ? 'right' : 'left') : d < 0 ? 'down' : 'up';
      enqueue(action);
      x = t.clientX;
      y = t.clientY;
    },
    { passive: false },
  );
}
