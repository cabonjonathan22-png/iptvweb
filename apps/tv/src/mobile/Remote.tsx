import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlayResponse, RemoteCommand, RemoteKey, RemoteTarget } from '@iptv/shared';
import { api, ApiError } from '../lib/api';
import { canAirplay, canCast, canPip, castMedia, showAirplay, togglePip } from '../player/cast';
import { player } from '../player/engine';
import { Icon, Sheet, Spinner } from './ui';

/** Appareils du compte allumés sur Oria ; rafraîchi tant que le panneau est ouvert. */
function useTargets() {
  const [targets, setTargets] = useState<RemoteTarget[] | null>(null);
  useEffect(() => {
    const load = () => api.remoteTargets().then(setTargets).catch(() => setTargets([]));
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, []);
  return targets;
}

const NoTarget = () => <p class="m-muted">Aucune TV allumée. Ouvrez Oria sur votre TV : elle apparaîtra ici en quelques secondes.</p>;

/** Pavé de télécommande pour un appareil. */
function Pad({ target }: { target: RemoteTarget }) {
  const [error, setError] = useState<string | null>(null);
  // Les envois sont enchaînés : un appui rapide ne doit pas écraser le précédent dans la file.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const send = (command: RemoteCommand) => {
    chain.current = chain.current.then(() => api.remoteSend(target.id, command).then(() => setError(null))).catch((e: ApiError) => setError(e.message || 'Envoi impossible.'));
  };
  useEffect(() => {
    // Tant que le pavé est ouvert, la TV interroge le serveur plus souvent.
    send({ type: 'wake' });
    const t = window.setInterval(() => send({ type: 'wake' }), 30_000);
    return () => window.clearInterval(t);
  }, [target.id]);

  const key = (k: RemoteKey, label: ComponentChildren, aria: string, cls = '') => (
    <button class={'m-pad-key ' + cls} aria-label={aria} onClick={() => send({ type: 'key', key: k })}>
      {label}
    </button>
  );
  return (
    <div class="m-pad">
      <p class="m-pad-name">{target.name}</p>
      <div class="m-pad-cross">
        <span />
        {key('up', <Icon name="chevronUp" />, 'Haut')}
        <span />
        {key('left', <Icon name="back" />, 'Gauche')}
        {key('ok', 'OK', 'OK', 'm-pad-ok')}
        {key('right', <Icon name="back" />, 'Droite', 'm-flip')}
        <span />
        {key('down', <Icon name="chevronDown" />, 'Bas')}
        <span />
      </div>
      <div class="m-pad-row">
        {key('back', 'Retour', 'Retour')}
        {key('playPause', <><Icon name="play" /><Icon name="pause" /></>, 'Lecture ou pause')}
      </div>
      <div class="m-pad-row">
        {key('chDown', 'CH −', 'Chaîne précédente')}
        {key('chUp', 'CH +', 'Chaîne suivante')}
      </div>
      {error && <p class="m-error">{error}</p>}
    </div>
  );
}

/** Réglages > Télécommande. */
export function RemoteSheet({ onClose }: { onClose: () => void }) {
  const targets = useTargets();
  const [target, setTarget] = useState<RemoteTarget | null>(null);
  return (
    <Sheet title="Télécommande" onClose={onClose}>
      {target ? <Pad target={target} /> : <TargetList targets={targets} onPick={setTarget} />}
    </Sheet>
  );
}

function TargetList({ targets, onPick }: { targets: RemoteTarget[] | null; onPick: (t: RemoteTarget) => void }) {
  if (!targets) return <Spinner />;
  if (!targets.length) return <NoTarget />;
  return (
    <div class="m-list">
      {targets.map((t) => (
        <button key={t.id} class="m-list-item" onClick={() => onPick(t)}>
          <span>{t.name}</span>
          <span class="m-muted">›</span>
        </button>
      ))}
    </div>
  );
}

/** Lecteur > Diffuser : TV Oria, Chromecast, AirPlay, image dans l'image. */
export function CastSheet({
  onClose,
  command,
  source,
  title,
  startAt,
}: {
  onClose: () => void;
  /** Absente pour un contenu qu'on ne peut pas ouvrir à distance (replay). */
  command?: () => RemoteCommand;
  source: () => Promise<PlayResponse>;
  title: string;
  startAt?: () => number;
}) {
  const targets = useTargets();
  const [sentTo, setSentTo] = useState<RemoteTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendTo = (t: RemoteTarget) => {
    setError(null);
    api
      .remoteSend(t.id, command!())
      .then(() => {
        // La lecture continue sur la TV : on coupe le son ici.
        if (player.video) player.video.pause();
        setSentTo(t);
      })
      .catch((e: ApiError) => setError(e.message || 'Envoi impossible.'));
  };
  if (sentTo) {
    return (
      <Sheet title="Lecture sur la TV" onClose={onClose}>
        <Pad target={sentTo} />
      </Sheet>
    );
  }
  return (
    <Sheet title="Diffuser" onClose={onClose}>
      {command && (
        <>
          <p class="m-label">Sur une TV avec Oria</p>
          <TargetList targets={targets} onPick={sendTo} />
        </>
      )}
      <div class="m-list">
        {canCast() && (
          <button
            class="m-list-item"
            onClick={() => {
              setError(null);
              castMedia(source, title, startAt && startAt()).then(onClose, (e: Error | string) => {
                // Fermer le choix de l'appareil n'est pas une erreur.
                if (e !== 'cancel' && e instanceof Error) setError(e.message);
              });
            }}
          >
            <span class="m-with-icon"><Icon name="cast" />Chromecast</span>
          </button>
        )}
        {canAirplay() && (
          <button class="m-list-item" onClick={() => (showAirplay(), onClose())}>
            <span class="m-with-icon"><Icon name="airplay" />AirPlay</span>
          </button>
        )}
        {canPip() && (
          <button class="m-list-item" onClick={() => (togglePip(), onClose())}>
            <span class="m-with-icon"><Icon name="pip" />Image dans l'image</span>
          </button>
        )}
      </div>
      {error && <p class="m-error">{error}</p>}
    </Sheet>
  );
}
