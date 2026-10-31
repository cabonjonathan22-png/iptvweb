import type { ComponentChildren } from 'preact';
import { FocusLayer, useKeyHandler } from '../nav/hooks';

/** Modale : capture le focus (couche dédiée) et la touche Retour. */
export function Dialog({
  name,
  title,
  onClose,
  children,
}: {
  name: string;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  useKeyHandler((k) => {
    if (k.action === 'back') {
      onClose();
      return true;
    }
    return false;
  });
  return (
    <FocusLayer name={name}>
      <div class="dialog-backdrop">
        <div class="dialog">
          <h2 class="dialog-title">{title}</h2>
          {children}
        </div>
      </div>
    </FocusLayer>
  );
}
