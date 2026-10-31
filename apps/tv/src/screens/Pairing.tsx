import { useEffect, useRef, useState } from 'preact/hooks';
import { PAIR_POLL_INTERVAL_MS, type PairStartResponse } from '@iptv/shared';
import { api, ApiError } from '../lib/api';
import { storage } from '../lib/storage';
import { useApp } from '../app-context';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; data: PairStartResponse }
  | { phase: 'error'; message: string };

const RETRY_DELAYS = [2000, 5000, 10000, 20000];

export function PairingScreen() {
  const app = useApp();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [now, setNow] = useState(Date.now());
  const timers = useRef<{ poll: number; tick: number; retry: number; attempts: number; alive: boolean }>({
    poll: 0,
    tick: 0,
    retry: 0,
    attempts: 0,
    alive: true,
  });

  const clearTimers = () => {
    const t = timers.current;
    window.clearTimeout(t.poll);
    window.clearTimeout(t.retry);
  };

  const start = () => {
    clearTimers();
    setState({ phase: 'loading' });
    api
      .pairStart()
      .then((data) => {
        if (!timers.current.alive) return;
        timers.current.attempts = 0;
        setState({ phase: 'ready', data });
        schedulePoll(data);
      })
      .catch((e: ApiError) => {
        if (!timers.current.alive) return;
        const t = timers.current;
        const delay = RETRY_DELAYS[Math.min(t.attempts++, RETRY_DELAYS.length - 1)]!;
        setState({
          phase: 'error',
          message:
            e.status === 429
              ? 'Trop de demandes de code. Nouvel essai dans un instant…'
              : 'Impossible de joindre le serveur. Vérifiez la connexion Internet de la TV.',
        });
        t.retry = window.setTimeout(start, delay);
      });
  };

  const schedulePoll = (data: PairStartResponse) => {
    timers.current.poll = window.setTimeout(() => poll(data), PAIR_POLL_INTERVAL_MS);
  };

  const poll = (data: PairStartResponse) => {
    api
      .pairStatus(data.code, data.secret)
      .then((res) => {
        if (!timers.current.alive) return;
        if (res.status === 'linked') {
          storage.setToken(res.token);
          app.boot();
        } else if (res.status === 'expired') {
          start();
        } else {
          schedulePoll(data);
        }
      })
      .catch((e: ApiError) => {
        if (!timers.current.alive) return;
        if (e.status === 404) start();
        // Réseau / 429 : on continue simplement le polling.
        else schedulePoll(data);
      });
  };

  useEffect(() => {
    const t = timers.current;
    t.alive = true;
    start();
    t.tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      t.alive = false;
      clearTimers();
      window.clearInterval(t.tick);
    };
  }, []);

  const data = state.phase === 'ready' ? state.data : null;
  const remaining = data ? Math.max(0, Math.round((data.expiresAt - now) / 1000)) : 0;
  const shortUrl = data ? data.linkUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '') : '';

  return (
    <div class="screen pairing">
      <div class="pairing-left">
        <Logo size={72} />
        <h1 class="pairing-title">Liez cette TV à votre compte</h1>
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
