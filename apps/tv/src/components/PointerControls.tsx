import { isPointerDevice, toggleFullscreen } from '../lib/device';
import { sendKey } from '../nav/hooks';
import type { Action } from '../nav/keys';

export type PointerItem = [label: string, action: Action | 'fullscreen' | (() => void)];

/**
 * Boutons à l'écran du lecteur (PC, téléphone). Ils envoient les mêmes actions
 * que la télécommande. Non focusables : la navigation au clavier n'est pas modifiée.
 */
export function PointerControls({ items, visible }: { items: PointerItem[]; visible: boolean }) {
  if (!isPointerDevice) return null;
  return (
    <div class={'pc-bar' + (visible ? ' is-visible' : '')}>
      {items.map(([label, action]) => (
        <button
          key={label}
          type="button"
          class="pc-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (typeof action === 'function') action();
            else if (action === 'fullscreen') toggleFullscreen();
            else sendKey(action);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
