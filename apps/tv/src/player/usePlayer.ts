import { useEffect, useReducer } from 'preact/hooks';
import { player } from './engine';

/** Re-rend le composant à chaque changement d'état du lecteur. */
export function usePlayer() {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => player.subscribe(() => tick(undefined)), []);
  return player;
}
