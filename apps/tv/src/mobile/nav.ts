/**
 * Retour système (geste, bouton Android, bouton du navigateur) : chaque écran,
 * panneau ou lecteur ouvert empile une entrée d'historique et ce qui le ferme.
 */
type Handler = () => void;

const handlers: Handler[] = [];
/** Retours déclenchés par l'app elle-même : le popstate correspondant est ignoré. */
let skip = 0;
/** Entrées d'historique dont l'écran a déjà disparu (changement d'onglet). */
let stale = 0;

window.addEventListener('popstate', () => {
  if (skip > 0) {
    skip--;
    return;
  }
  const fn = handlers.pop();
  if (fn) fn();
  else if (stale > 0) {
    stale--;
    window.history.back();
  }
});

/** Renvoie la fonction à appeler quand la fermeture vient de l'interface. */
export function pushBack(fn: Handler): () => void {
  window.history.pushState({ oria: 1 }, '');
  handlers.push(fn);
  return () => {
    const i = handlers.indexOf(fn);
    if (i < 0) return; // déjà fermé par le retour système
    handlers.splice(i, 1);
    skip++;
    window.history.back();
  };
}

/** Oublie une entrée sans naviguer : elle sera traversée au prochain retour. */
export function dropBack(fn: Handler) {
  const i = handlers.indexOf(fn);
  if (i < 0) return;
  handlers.splice(i, 1);
  stale++;
}

/** Bouton « retour » de l'interface : même chemin que le retour système. */
export const goBack = () => window.history.back();
