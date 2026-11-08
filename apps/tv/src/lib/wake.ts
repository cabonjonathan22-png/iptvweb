import { player } from '../player/engine';
import { storage } from './storage';

/**
 * Réveille le proxy de flux dès l'ouverture de l'app, et le garde éveillé tant que
 * quelqu'un s'en sert (hébergement gratuit : veille après 15 min). La première
 * chaîne n'attend ainsi plus son redémarrage, et la connexion est déjà ouverte.
 */
const ORIGIN = 'proxyOrigin';
const KEEP_AWAKE_MS = 10 * 60_000;
const ACTIVE_FOR_MS = 30 * 60_000;

function ping(origin: string) {
  const x = new XMLHttpRequest();
  x.open('GET', origin + '/health', true);
  x.timeout = 90_000;
  x.send();
}

export function startProxyWake() {
  let origin = storage.getPref<string>(ORIGIN, '');
  let lastActive = Date.now();
  const active = () => (lastActive = Date.now());
  document.addEventListener('keydown', active);
  document.addEventListener('mousemove', active);
  document.addEventListener('touchstart', active);

  if (origin) {
    ping(origin);
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    document.head.appendChild(link);
  }
  // Découverte ou changement d'adresse : à la première lecture passée par le proxy.
  player.subscribe(() => {
    // Seul le proxy de secours (Render) se met en veille ; le relais Cloudflare ne dort pas.
    const m = player.src && /^(https?:\/\/[^/]+)\/(?:s|x)\//.exec(player.src.url);
    if (m && /workers\.dev$/.test(m[1]!)) return;
    if (m && m[1] !== origin) {
      origin = m[1]!;
      storage.setPref(ORIGIN, origin);
    }
  });
  window.setInterval(() => {
    if (origin && !document.hidden && (player.state === 'playing' || Date.now() - lastActive < ACTIVE_FOR_MS)) ping(origin);
  }, KEEP_AWAKE_MS);
}
