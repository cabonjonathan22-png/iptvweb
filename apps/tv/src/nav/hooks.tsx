import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { focus, type FocusCallbacks } from './focus';
import type { Action, KeyAction } from './keys';

/* -------------------------------------------------------------- Couches */

const LayerCtx = createContext<string>('root');

/**
 * `base` : couche d'écran (remplace la précédente). Sinon : modale empilée,
 * qui capture le focus tant qu'elle est montée.
 */
export function FocusLayer({ name, base, children }: { name: string; base?: boolean; children: ComponentChildren }) {
  useLayoutEffect(() => {
    if (base) {
      focus.setBase(name);
      return undefined;
    }
    focus.push(name);
    return () => focus.pop(name);
  }, [name, base]);
  return <LayerCtx.Provider value={name}>{children}</LayerCtx.Provider>;
}

export function useLayer() {
  return useContext(LayerCtx);
}

/* ----------------------------------------------------------- Focusable */

let autoId = 0;

export interface UseFocusableOpts extends FocusCallbacks {
  /** Id stable (requis pour la mémorisation du focus entre deux visites d'écran). */
  id?: string;
  autoFocus?: boolean;
}

export function useFocusable<T extends HTMLElement = HTMLDivElement>(opts: UseFocusableOpts) {
  const layer = useLayer();
  const ref = useRef<T>(null);
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = opts.id || 'f' + ++autoId;
  const id = opts.id || idRef.current;

  // Callbacks toujours à jour sans réinscription à chaque rendu.
  const cbRef = useRef<FocusCallbacks>(opts);
  cbRef.current = opts;
  const [focused, setFocused] = useState(() => focus.isFocused(id));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const unsub = focus.subscribe(id, setFocused);
    focus.register(id, el, layer, !!opts.autoFocus, {
      onSelect: () => cbRef.current.onSelect && cbRef.current.onSelect(),
      onFocus: () => cbRef.current.onFocus && cbRef.current.onFocus(),
      onArrow: (d) => !!(cbRef.current.onArrow && cbRef.current.onArrow(d)),
    });
    setFocused(focus.isFocused(id));

    // Télécommandes pointeur (Magic Remote…) : survol = focus, clic = OK.
    const onEnter = () => focus.focus(id);
    el.addEventListener('touchstart', onEnter, { passive: true });
    const onClick = () => {
      focus.focus(id);
      focus.select();
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('touchstart', onEnter);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('click', onClick);
      unsub();
      focus.unregister(id);
    };
  }, [id, layer]);

  return { ref, focused, id };
}

/* -------------------------------------------------------- Touches */

export type KeyHandler = (k: KeyAction) => boolean;

/** Pile de handlers : le plus récemment monté est consulté en premier. */
export const keyHandlers: KeyHandler[] = [];

let defaultKey: ((k: KeyAction) => void) | null = null;
/** Comportement par défaut (navigation, OK, Retour), installé par l'App. */
export function setDefaultKeyHandler(fn: (k: KeyAction) => void) {
  defaultKey = fn;
}

export function dispatchKey(k: KeyAction) {
  for (let i = keyHandlers.length - 1; i >= 0; i--) if (keyHandlers[i]!(k)) return;
  if (defaultKey) defaultKey(k);
}

/** Envoie une action comme si elle venait de la télécommande (souris, tactile). */
export function sendKey(action: Action) {
  dispatchKey({ action, repeat: false });
}

export function useKeyHandler(fn: KeyHandler, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    const h: KeyHandler = (k) => ref.current(k);
    keyHandlers.push(h);
    return () => {
      const i = keyHandlers.indexOf(h);
      if (i >= 0) keyHandlers.splice(i, 1);
    };
  }, [enabled]);
}
