import { useEffect, useRef, useState } from 'preact/hooks';
import type { TvChannel } from '@iptv/shared';
import { FocusLayer, useKeyHandler } from '../nav/hooks';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Img } from '../components/Img';
import { usePlayer } from './usePlayer';

const OVERLAY_MS = 4000;
const DIGIT_WAIT_MS = 1500;

interface Props {
  channel: TvChannel;
  /** Message temporaire (ex. « Chaîne 512 introuvable »). */
  notice: string | null;
  onZap: (delta: 1 | -1) => void;
  onNumber: (n: number) => void;
  onLast: () => void;
  onExit: () => void;
}

const pad = (n: number) => (n < 10 ? '0' + n : String(n));
const clock = () => {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
};

/**
 * Lecture plein écran du direct. La vidéo elle-même est dans la couche vidéo
 * (player/host.ts) ; ce composant n'est que l'interface par-dessus.
 */
export function FullPlayer({ channel, notice, onZap, onNumber, onLast, onExit }: Props) {
  const p = usePlayer();
  const [overlay, setOverlay] = useState(true);
  const [digits, setDigits] = useState('');
  const [tracks, setTracks] = useState(false);
  const [time, setTime] = useState(clock());
  const hideTimer = useRef(0);
  const digitTimer = useRef(0);

  const show = () => {
    setOverlay(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOverlay(false), OVERLAY_MS);
  };

  useEffect(() => {
    show();
    const t = window.setInterval(() => setTime(clock()), 15_000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(digitTimer.current);
    };
  }, []);
  // Nouvelle chaîne : on réaffiche les infos.
  useEffect(show, [channel.id]);

  useKeyHandler((k) => {
    if (tracks) return false; // la modale gère ses touches
    switch (k.action) {
      case 'back':
        if (digits) {
          setDigits('');
          return true;
        }
        onExit();
        return true;
      case 'up':
      case 'chUp':
        onZap(1);
        return true;
      case 'down':
      case 'chDown':
        onZap(-1);
        return true;
      case 'digit': {
        const next = (digits + k.digit).slice(0, 5);
        setDigits(next);
        show();
        window.clearTimeout(digitTimer.current);
        digitTimer.current = window.setTimeout(() => {
          setDigits('');
          onNumber(parseInt(next, 10));
        }, DIGIT_WAIT_MS);
        return true;
      }
      case 'green':
        onLast();
        return true;
      case 'yellow':
        setTracks(true);
        return true;
      case 'play':
      case 'pause':
      case 'playPause':
        p.toggle();
        show();
        return true;
      case 'ok':
        // En erreur, OK active le bouton « Réessayer » (navigation normale).
        if (p.state === 'error') return false;
        show();
        return true;
      default:
        show();
        return p.state !== 'error';
    }
  });

  const loading = p.state === 'loading' || p.state === 'buffering';

  return (
    <FocusLayer name="player">
      <div class="player-ui">
        {loading && <div class="spinner spinner-corner" aria-label="Chargement" />}
        {loading && p.reconnect && (
          <div class="osd-reconnect">
            Reconnexion ({p.reconnect.attempt}/{p.reconnect.max})…
          </div>
        )}

        {p.state === 'error' && p.error && (
          <div class="player-error">
            <Img src={channel.logo} name={channel.name} class="player-error-logo" />
            <h2>{channel.name}</h2>
            <p>{p.error.message}</p>
            <div class="row-actions center">
              <Button id="player-retry" variant="primary" autoFocus onSelect={() => p.retry()}>
                Réessayer
              </Button>
              <Button id="player-next" onSelect={() => onZap(1)}>
                Chaîne suivante
              </Button>
            </div>
          </div>
        )}

        {digits && <div class="osd-number">{digits}<span class="osd-caret">_</span></div>}
        {notice && <div class="osd-notice">{notice}</div>}

        <div class={'player-bar' + (overlay || loading ? ' is-visible' : '')}>
          <Img src={channel.logo} name={channel.name} class="player-logo" />
          <div class="player-info">
            <div class="player-title">
              {channel.num !== null && <span class="player-num">{channel.num}</span>}
              {channel.name}
            </div>
            <div class="player-sub">
              {p.state === 'paused' ? 'En pause' : loading ? 'Chargement…' : 'En direct'}
              <span class="player-epg"> · Guide TV bientôt disponible</span>
            </div>
          </div>
          <div class="player-side">
            <div class="player-clock">{time}</div>
            <div class="player-hints">
              <span class="key-chip">CH ▲▼</span> Zapper
              <span class="dot dot-green" /> Dernière
              <span class="dot dot-yellow" /> Pistes
            </div>
          </div>
        </div>
      </div>

      {tracks && <TracksDialog onClose={() => setTracks(false)} />}
    </FocusLayer>
  );
}

function TracksDialog({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const audio = p.audioTracks();
  const subs = p.subtitleTracks();
  return (
    <Dialog name="dlg-tracks" title="Pistes" onClose={onClose}>
      <p class="dialog-label">Audio</p>
      <div class="chips">
        {audio.length ? (
          audio.map((t) => (
            <Button key={'a' + t.id} id={'trk-a' + t.id} variant={t.active ? 'primary' : 'ghost'} autoFocus={t.active} onSelect={() => p.setAudioTrack(t.id)}>
              {t.label}
            </Button>
          ))
        ) : (
          <span class="dialog-text">Une seule piste audio.</span>
        )}
      </div>
      <p class="dialog-label">Sous-titres</p>
      <div class="chips">
        <Button id="trk-s-off" variant={subs.some((t) => t.active) ? 'ghost' : 'primary'} autoFocus={!audio.length} onSelect={() => p.setSubtitleTrack(-1)}>
          Désactivés
        </Button>
        {subs.map((t) => (
          <Button key={'s' + t.id} id={'trk-s' + t.id} variant={t.active ? 'primary' : 'ghost'} onSelect={() => p.setSubtitleTrack(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
