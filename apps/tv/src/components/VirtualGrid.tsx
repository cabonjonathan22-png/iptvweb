import type { VNode } from 'preact';
import { useFocusable } from '../nav/hooks';
import { focus } from '../nav/focus';

/**
 * Grille virtualisée (jaquettes) : seules les rangées visibles sont rendues.
 * Un seul nœud focusable ; gauche depuis la 1re colonne rend la main à la
 * navigation spatiale (colonne des catégories).
 */
interface Props {
  id: string;
  count: number;
  columns: number;
  cellW: number;
  cellH: number;
  height: number;
  index: number;
  onIndex: (i: number) => void;
  onSelect: (i: number) => void;
  renderCell: (i: number, focused: boolean) => VNode;
  autoFocus?: boolean;
}

export function VirtualGrid(p: Props) {
  const { ref, focused } = useFocusable<HTMLDivElement>({
    id: p.id,
    autoFocus: p.autoFocus,
    onSelect: () => p.count > 0 && p.onSelect(p.index),
    onArrow: (dir) => {
      if (!p.count) return false;
      const col = p.index % p.columns;
      let next = p.index;
      if (dir === 'left') {
        if (col === 0) return false;
        next--;
      } else if (dir === 'right') {
        if (col === p.columns - 1 || p.index + 1 >= p.count) return true;
        next++;
      } else if (dir === 'down') {
        if (p.index + p.columns >= p.count) {
          // Dernière rangée incomplète : on va au dernier élément.
          if (Math.floor(p.index / p.columns) < Math.floor((p.count - 1) / p.columns)) next = p.count - 1;
          else return true;
        } else next += p.columns;
      } else {
        if (p.index - p.columns < 0) return false;
        next -= p.columns;
      }
      p.onIndex(next);
      return true;
    },
  });

  const rows = Math.ceil(p.count / p.columns);
  const row = Math.floor(p.index / p.columns);
  const maxScroll = Math.max(0, rows * p.cellH - p.height);
  const scroll = Math.max(0, Math.min(maxScroll, row * p.cellH - (p.height - p.cellH) / 3));
  const firstRow = Math.max(0, Math.floor(scroll / p.cellH) - 1);
  const lastRow = Math.min(rows, Math.ceil((scroll + p.height) / p.cellH) + 1);

  const cells: VNode[] = [];
  for (let r = firstRow; r < lastRow; r++) {
    for (let c = 0; c < p.columns; c++) {
      const i = r * p.columns + c;
      if (i >= p.count) break;
      const isFocused = focused && i === p.index;
      cells.push(
        <div
          key={i}
          class={'grid-cell' + (isFocused ? ' is-focused' : '')}
          style={{ left: c * p.cellW + 'px', top: r * p.cellH + 'px', width: p.cellW + 'px', height: p.cellH + 'px' }}
          onClick={(e) => {
            e.stopPropagation();
            focus.focus(p.id);
            p.onIndex(i);
            p.onSelect(i);
          }}
        >
          {p.renderCell(i, isFocused)}
        </div>,
      );
    }
  }

  return (
    <div ref={ref} class="vgrid" style={{ height: p.height + 'px' }}>
      <div class="vgrid-inner" style={{ transform: 'translateY(' + -scroll + 'px)', WebkitTransform: 'translateY(' + -scroll + 'px)' }}>
        {cells}
      </div>
    </div>
  );
}
