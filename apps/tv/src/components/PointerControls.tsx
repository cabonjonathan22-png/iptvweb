import { toggleFullscreen } from '../lib/device';
import { sendKey } from '../nav/hooks';
import { Icon } from './Icon';
import type { Action } from '../nav/keys';

export type PointerItem = [label: string, action: Action | 'fullscreen' | (() => void), icon: string, iconLabel?: string];

/**
 * Boutons à l'écran du lecteur (PC, et TV pilotée au pointeur : voir ScrollArrows). Ils envoient les mêmes actions
 * que la télécommande. Non focusables : la navigation au clavier n'est pas modifiée.
 */
export function PointerControls({ items, visible }: { items: PointerItem[]; visible: boolean }) {
  return (
    <div class={'pc-bar' + (visible ? ' is-visible' : '')}>
      {items.map(([label, action, icon, iconLabel]) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={label}
          class="pc-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (typeof action === 'function') action();
            else if (action === 'fullscreen') toggleFullscreen();
            else sendKey(action);
          }}
        >
          <Icon name={icon} size={52} label={iconLabel} />
        </button>
      ))}
    </div>
  );
}
