import type { VNode } from 'preact';
import { useFocusable } from '../nav/hooks';
import { focus } from '../nav/focus';

/**
 * Liste verticale virtualisée : seules les lignes visibles (+ marge) existent
 * dans le DOM (~15 nœuds pour 50 000 chaînes). Le défilement est un transform
 * sur un conteneur interne : aucun reflow pendant la navigation.
 *
 * La liste entière est UN nœud focusable : haut/bas changent l'index en
 * interne, gauche/droite sont laissés à la navigation spatiale.
 */
interface Props {
  id: string;
  count: number;
  rowHeight: number;
  /** Hauteur visible (px, base 1080p). */
  height: number;
  index: number;
  onIndex: (i: number) => void;
  onSelect?: (i: number) => void;
  onFocusChange?: (focused: boolean) => void;
  renderRow: (i: number, focused: boolean) => VNode;
  autoFocus?: boolean;
  class?: string;
}

const OVERSCAN = 2;

export function VirtualList(p: Props) {
  const { ref, focused } = useFocusable<HTMLDivElement>({
    id: p.id,
    autoFocus: p.autoFocus,
    onFocus: () => p.onFocusChange && p.onFocusChange(true),
    onSelect: () => p.count > 0 && p.onSelect && p.onSelect(p.index),
    onArrow: (dir) => {
      if (dir !== 'up' && dir !== 'down') return false;
      if (!p.count) return false;
      const next = p.index + (dir === 'down' ? 1 : -1);
      if (next >= 0 && next < p.count) p.onIndex(next);
      return true;
    },
  });

  const rh = p.rowHeight;
  const maxScroll = Math.max(0, p.count * rh - p.height);
  // Ligne focalisée maintenue vers le centre de la zone visible.
  const scroll = Math.max(0, Math.min(maxScroll, p.index * rh - (p.height - rh) / 2));
  const first = Math.max(0, Math.floor(scroll / rh) - OVERSCAN);
  const last = Math.min(p.count, Math.ceil((scroll + p.height) / rh) + OVERSCAN);

  const rows: VNode[] = [];
  for (let i = first; i < last; i++) {
    const isFocused = focused && i === p.index;
    rows.push(
      <div
        key={i}
        class={'vl-row' + (i === p.index ? ' is-current' : '') + (isFocused ? ' is-focused' : '')}
        style={{ top: i * rh + 'px', height: rh + 'px' }}
        onClick={(e) => {
          e.stopPropagation();
          focus.focus(p.id);
          p.onIndex(i);
          if (p.onSelect) p.onSelect(i);
        }}
      >
        {p.renderRow(i, isFocused)}
      </div>,
    );
  }

  return (
    <div
      ref={ref}
      class={'vl' + (focused ? ' vl-focused' : '') + (p.class ? ' ' + p.class : '')}
      style={{ height: p.height + 'px' }}
      onWheel={(e) => {
        const next = p.index + (e.deltaY > 0 ? 1 : -1);
        if (next >= 0 && next < p.count) p.onIndex(next);
      }}
    >
      <div class="vl-inner" style={{ transform: 'translateY(' + -scroll + 'px)', WebkitTransform: 'translateY(' + -scroll + 'px)' }}>
        {rows}
      </div>
    </div>
  );
}
