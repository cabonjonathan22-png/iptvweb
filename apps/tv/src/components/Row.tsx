import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { useFocusable } from '../nav/hooks';
import { ScrollArrows } from './ScrollArrows';
import { focus } from '../nav/focus';

/**
 * Rangée horizontale façon Netflix, virtualisée : seules les cartes visibles
 * (+ marge) sont rendues. Un seul nœud focusable : gauche/droite déplacent
 * l'index, haut/bas passent à la rangée voisine (navigation spatiale).
 */
interface Props {
  id: string;
  title: string;
  count: number;
  /** Largeur d'une carte, marge comprise (px, base 1080p). */
  itemWidth: number;
  height: number;
  renderItem: (i: number, focused: boolean) => VNode;
  onSelect: (i: number) => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  initialIndex?: number;
  /** Largeur visible (px) ; par défaut toute la largeur utile de l'écran. */
  viewWidth?: number;
}

export function Row(p: Props) {
  const [index, setIndex] = useState(Math.min(p.initialIndex || 0, Math.max(0, p.count - 1)));
  const { ref, focused } = useFocusable<HTMLDivElement>({
    id: p.id,
    autoFocus: p.autoFocus,
    onFocus: p.onFocus,
    onSelect: () => p.count > 0 && p.onSelect(index),
    onArrow: (dir) => {
      if (dir !== 'left' && dir !== 'right') return false;
      const next = index + (dir === 'right' ? 1 : -1);
      if (next < 0 || next >= p.count) return true;
      setIndex(next);
      return true;
    },
  });

  // La carte focalisée reste visible ; on ne fait défiler qu'en arrivant au bord.
  const perView = Math.floor((p.viewWidth || 1728) / p.itemWidth);
  const first = Math.max(0, Math.min(index - perView + 2, p.count - perView));
  const scroll = Math.max(0, first) * p.itemWidth;
  const from = Math.max(0, Math.floor(scroll / p.itemWidth) - 1);
  const to = Math.min(p.count, from + perView + 3);

  const items: VNode[] = [];
  for (let i = from; i < to; i++) {
    items.push(
      <div
        key={i}
        class={'row-item' + (focused && i === index ? ' is-focused' : '')}
        style={{ left: i * p.itemWidth + 'px', width: p.itemWidth + 'px' }}
        onClick={(e) => {
          e.stopPropagation();
          focus.focus(p.id);
          setIndex(i);
          p.onSelect(i);
        }}
      >
        {p.renderItem(i, focused && i === index)}
      </div>,
    );
  }

  return (
    <section class="row" style={{ height: p.height + 'px' }}>
      <h2 class="row-title">{p.title}</h2>
      <div ref={ref} class="row-track" style={{ height: p.height - 64 + 'px' }}>
        <div class="row-inner" style={{ transform: 'translateX(' + -scroll + 'px)', WebkitTransform: 'translateX(' + -scroll + 'px)' }}>
          {items}
        </div>
        {p.count > perView && (
          <ScrollArrows
            dirs={['left', 'right']}
            onStep={(d) => {
              focus.focus(p.id);
              setIndex(Math.max(0, Math.min(p.count - 1, index + (d === 'right' ? perView - 1 : 1 - perView))));
            }}
          />
        )}
      </div>
    </section>
  );
}
