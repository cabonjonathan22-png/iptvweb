/**
 * Souris et tactile : la molette et les glissements sont traduits en flèches.
 * Listes, grilles, rangées et lecteur (zapping, avance rapide) réagissent donc
 * exactement comme à la télécommande, sans logique dédiée à chaque composant.
 */
import { sendKey } from './hooks';
import type { Action } from './keys';

const WHEEL_STEP = 80;
const SWIPE_STEP = 40;
const STEP_MS = 40;

const queue: Action[] = [];
let timer = 0;
function enqueue(a: Action) {
  // Sans limite, une grande molette ferait défiler bien après la fin du geste.
  if (queue.length < 20) queue.push(a);
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
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      ax += e.deltaX;
      ay += e.deltaY;
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
