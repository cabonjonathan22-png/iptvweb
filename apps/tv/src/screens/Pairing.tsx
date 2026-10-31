import { useApp } from '../app-context';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { isPointerDevice } from '../lib/device';
import { usePairing } from './usePairing';

export function PairingScreen() {
  const app = useApp();
  const { state, data, remaining, start } = usePairing(app.boot);
  const shortUrl = data ? data.linkUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '') : '';

  return (
    <div class="screen pairing">
      <div class="pairing-left">
        <Logo size={72} />
        <h1 class="pairing-title">Liez {isPointerDevice ? 'cet appareil' : 'cette TV'} à votre compte</h1>
        <ol class="pairing-steps">
          <li>
            <span class="step-n">1</span>
            <span>
              Sur votre téléphone, scannez le QR code ou allez sur
              <strong class="accent"> {shortUrl || '…'}</strong>
            </span>
          </li>
          <li>
            <span class="step-n">2</span>
            <span>Connectez-vous puis saisissez le code ci-dessous</span>
          </li>
        </ol>

        <div class="pair-code" aria-live="polite">
          {data
            ? data.code.split('').map((c, i) => (
                <span key={i} class={'pair-char' + (i === 3 ? ' pair-gap' : '')}>
                  {c}
                </span>
              ))
            : [0, 1, 2, 3, 4, 5].map((i) => <span key={i} class={'pair-char skeleton' + (i === 3 ? ' pair-gap' : '')} />)}
        </div>

        <div class="pairing-status">
          {state.phase === 'error' ? (
            <span class="error-text">{state.message}</span>
          ) : (
            <span class="waiting">
              <i />
              <i />
              <i />
              <span class="waiting-label">
                En attente de liaison
                {data ? ' · code valable ' + Math.floor(remaining / 60) + ':' + pad(remaining % 60) : ''}
              </span>
            </span>
          )}
        </div>

        <div class="pairing-actions">
          <Button id="pair-renew" variant="ghost" onSelect={start} autoFocus>
            Nouveau code
          </Button>
        </div>
      </div>

      <div class="pairing-right">
        <div class="qr-box">
          {data ? (
            <img
              class="qr"
              alt="QR code de liaison"
              src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data.qrSvg)}
            />
          ) : (
            <div class="qr skeleton" />
          )}
        </div>
        <p class="qr-caption">Scannez avec l&apos;appareil photo</p>
      </div>
    </div>
  );
}

const pad = (n: number) => (n < 10 ? '0' + n : String(n));
