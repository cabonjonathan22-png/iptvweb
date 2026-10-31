import { useState } from 'preact/hooks';
import { api, ApiError } from '../lib/api';
import { setUnlock } from '../lib/session';
import { useKeyHandler } from '../nav/hooks';
import { Button } from './Button';
import { Dialog } from './Dialog';

/**
 * Saisie du code parental : chiffres de la télécommande ou pavé à l'écran.
 * En cas de succès, le déverrouillage vaut 1 h pour toute l'app.
 */
export function PinDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const type = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setError(null);
    if (next.length === 4) submit(next);
  };

  const submit = (code: string) => {
    setBusy(true);
    api
      .unlockParental(code)
      .then((r) => {
        setUnlock(r.token);
        onUnlocked();
      })
      .catch((e: ApiError) => {
        setPin('');
        setBusy(false);
        setError(e.message || 'Code incorrect.');
      });
  };

  useKeyHandler((k) => {
    if (k.action === 'digit') {
      type(String(k.digit));
      return true;
    }
    return false;
  });

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'];
  return (
    <Dialog name="dlg-pin" title="Code parental" onClose={onClose}>
      <p class="dialog-text">Ce contenu est protégé. Saisissez le code à 4 chiffres.</p>
      <div class="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} class={'pin-dot' + (i < pin.length ? ' is-filled' : '')} />
        ))}
      </div>
      {error && <p class="dialog-text error-text">{error}</p>}
      <div class="pin-pad">
        {keys.map((k, i) => (
          <Button
            key={k}
            id={'pin-' + i}
            autoFocus={k === '1'}
            class="pin-key"
            onSelect={() => (k === '⌫' ? setPin(pin.slice(0, -1)) : type(k))}
          >
            {k}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
