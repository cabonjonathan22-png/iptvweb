import { useEffect, useRef } from 'preact/hooks';

const HOLD_DELAY_MS = 500;
const HOLD_REPEAT_MS = 200;

type Dir = 'up' | 'down' | 'left' | 'right';
const LABEL: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
const NAME: Record<Dir, string> = { up: 'Monter', down: 'Descendre', left: 'Gauche', right: 'Droite' };

function Arrow({ dir, onStep }: { dir: Dir; onStep: (d: Dir) => void }) {
  const step = useRef(onStep);
  step.current = onStep;
  const timers = useRef({ delay: 0, repeat: 0, held: false });
  const stop = () => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
  };
  useEffect(() => stop, []);
  return (
    <div
      class={'scroll-arrow scroll-' + dir}
      role="button"
      aria-label={NAME[dir]}
      onMouseDown={() => {
        const t = timers.current;
        t.held = false;
        stop();
        t.delay = window.setTimeout(() => {
          t.held = true;
          t.repeat = window.setInterval(() => step.current(dir), HOLD_REPEAT_MS);
        }, HOLD_DELAY_MS);
      }}
      onMouseUp={stop}
      onMouseLeave={stop}
      onClick={(e) => {
        // Ne doit pas activer la liste en dessous.
        e.stopPropagation();
        stop();
        if (!timers.current.held) step.current(dir);
      }}
    >
      {LABEL[dir]}
    </div>
  );
}

/**
 * Flèches à l'écran pour les pointeurs : sur certains navigateurs de TV, la
 * télécommande déplace une souris et n'envoie aucune touche à l'application.
 * Visibles seulement quand un pointeur est utilisé (classe `pointer-active`, ou PC).
 */
export function ScrollArrows({ dirs, onStep }: { dirs: Dir[]; onStep: (d: Dir) => void }) {
  return (
    <>
      {dirs.map((d) => (
        <Arrow key={d} dir={d} onStep={onStep} />
      ))}
    </>
  );
}
