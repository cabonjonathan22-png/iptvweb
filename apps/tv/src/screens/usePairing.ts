import { useEffect, useRef, useState } from 'preact/hooks';
import { PAIR_POLL_INTERVAL_MS, type PairStartResponse } from '@iptv/shared';
import { api, ApiError } from '../lib/api';
import { storage } from '../lib/storage';

export type PairingState =
  | { phase: 'loading' }
  | { phase: 'ready'; data: PairStartResponse }
  | { phase: 'error'; message: string };

const RETRY_DELAYS = [2000, 5000, 10000, 20000];

/** Demande un code de liaison, le renouvelle à expiration et attend la validation depuis le dashboard. */
export function usePairing(onLinked: () => void) {
  const [state, setState] = useState<PairingState>({ phase: 'loading' });
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
              : 'Impossible de joindre le serveur. Vérifiez la connexion Internet.',
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
          onLinked();
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
  return { state, data, remaining, start };
}
