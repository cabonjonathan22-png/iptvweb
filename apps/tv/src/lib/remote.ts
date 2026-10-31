import type { RemoteCommand } from '@iptv/shared';
import type { AppApi } from '../app-context';
import { sendKey } from '../nav/hooks';
import { player } from '../player/engine';
import { api } from './api';
import { storage } from './storage';

/**
 * Réception des commandes envoyées depuis un téléphone (TV et PC). Pas de
 * connexion permanente sur ces hébergements gratuits : on interroge le serveur,
 * vite pendant qu'une télécommande est ouverte, sinon à intervalle plus long.
 */
const SLOW_MS = 4000;
const FAST_MS = 1000;
const FAST_FOR_MS = 60_000;
const ERROR_MS = 15_000;
/** TV restée allumée sans personne : on cesse d'interroger, pour laisser la base gratuite en veille. */
const IDLE_AFTER_MS = 2 * 3600_000;

/** Ouvre un contenu en plein écran ; Retour ramène à l'accueil. */
export function openPlayback(app: AppApi, cmd: RemoteCommand) {
  if (cmd.type === 'live') app.open('live', { play: cmd.channel, returnOnExit: true });
  else if (cmd.type === 'vod') app.open('movie', { id: cmd.id, autoplay: true, startAt: cmd.startAt });
  else if (cmd.type === 'episode') app.open('seriesDetail', { id: cmd.seriesId, playEpisode: cmd.id, startAt: cmd.startAt });
}

export function startRemoteReceiver(app: AppApi): () => void {
  let timer = 0;
  let stopped = false;
  let fastUntil = 0;
  let lastInput = Date.now();
  const onInput = () => {
    const wasIdle = Date.now() - lastInput > IDLE_AFTER_MS;
    lastInput = Date.now();
    if (wasIdle) schedule(0);
  };

  const handle = (cmd: RemoteCommand) => {
    fastUntil = Date.now() + FAST_FOR_MS;
    if (cmd.type === 'key') sendKey(cmd.key);
    else if (cmd.type !== 'wake') openPlayback(app, cmd);
  };

  function schedule(ms: number) {
    window.clearTimeout(timer);
    if (!stopped) timer = window.setTimeout(tick, ms);
  }

  function tick() {
    const idle = Date.now() - lastInput > IDLE_AFTER_MS && player.state !== 'playing';
    if (!storage.getToken() || document.hidden || idle) {
      schedule(SLOW_MS);
      return;
    }
    api
      .remotePoll()
      .then((r) => {
        r.commands.forEach(handle);
        schedule(Date.now() < fastUntil ? FAST_MS : SLOW_MS);
      })
      .catch(() => schedule(ERROR_MS));
  }

  document.addEventListener('keydown', onInput);
  document.addEventListener('mousemove', onInput);
  schedule(SLOW_MS);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('keydown', onInput);
    document.removeEventListener('mousemove', onInput);
  };
}
