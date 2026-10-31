import { Button } from './Button';

const ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ-.', '1234567', '890'];

/**
 * Clavier virtuel navigable aux flèches. Les chiffres de la télécommande
 * sont aussi acceptés directement par l'écran de recherche.
 */
export function Keyboard({ onKey, onDelete, onClear }: { onKey: (c: string) => void; onDelete: () => void; onClear: () => void }) {
  return (
    <div class="kb">
      {ROWS.map((row, r) => (
        <div class="kb-row" key={r}>
          {row.split('').map((c, i) => (
            <Button key={c} id={'kb-' + c} class="kb-key" autoFocus={r === 0 && i === 0} onSelect={() => onKey(c)}>
              {c}
            </Button>
          ))}
          {r === ROWS.length - 1 && (
            <>
              <Button id="kb-space" class="kb-key kb-wide" onSelect={() => onKey(' ')}>
                Espace
              </Button>
              <Button id="kb-del" class="kb-key" onSelect={onDelete}>
                ⌫
              </Button>
              <Button id="kb-clear" class="kb-key kb-wide" onSelect={onClear}>
                Effacer
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
