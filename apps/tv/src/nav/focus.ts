/**
 * Moteur de navigation spatiale maison (≈ 3 Ko), pensé pour les TV lentes :
 *
 * - Les éléments focusables s'enregistrent avec un id et une « couche ».
 *   Couche de base = l'écran courant ; les modales empilent des couches au-dessus.
 *   Seule la couche du sommet reçoit le focus.
 * - Une flèche est d'abord proposée au nœud focalisé (`onArrow`) : les listes
 *   virtualisées gèrent ainsi elles-mêmes leur défilement par index, sans que
 *   les éléments hors écran n'existent dans le DOM. Si le nœud refuse, on
 *   cherche géométriquement le meilleur voisin dans la couche active.
 * - Le dernier focus de chaque couche est mémorisé : en revenant sur un écran,
 *   on retrouve l'élément sélectionné précédemment (si son id est stable).
 */

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface FocusCallbacks {
  onSelect?: () => void;
  onFocus?: () => void;
  /** Retourner true pour consommer la flèche (navigation interne d'une liste). */
  onArrow?: (dir: Dir) => boolean;
}

interface Node {
  id: string;
  el: HTMLElement;
  layer: string;
  autoFocus: boolean;
  cb: FocusCallbacks;
}

type Listener = (focused: boolean) => void;

class FocusManager {
  private nodes: { [id: string]: Node } = {};
  private layers: string[] = [];
  private memory: { [layer: string]: string } = {};
  private listeners: { [id: string]: Listener[] } = {};
  private ensureTimer = 0;
  current: string | null = null;

  /* ------------------------------------------------------------ couches */

  activeLayer(): string | undefined {
    return this.layers[this.layers.length - 1];
  }

  /** Remplace la couche de base (changement d'écran). */
  setBase(name: string) {
    this.layers[0] = name;
    if (this.layers.length === 1) this.restore();
  }

  push(name: string) {
    this.layers.push(name);
    this.restore();
  }

  pop(name: string) {
    const i = this.layers.lastIndexOf(name);
    if (i <= 0) return;
    this.layers.splice(i, 1);
    this.restore();
  }

  /** Dernier id focalisé dans une couche (utile aux listes virtualisées). */
  remembered(layer: string): string | undefined {
    return this.memory[layer];
  }

  /* -------------------------------------------------------- inscription */

  register(id: string, el: HTMLElement, layer: string, autoFocus: boolean, cb: FocusCallbacks) {
    this.nodes[id] = { id, el, layer, autoFocus, cb };
    if (layer !== this.activeLayer()) return;
    if (this.memory[layer] === id || (autoFocus && !this.isCurrentValid())) this.focus(id);
    else this.scheduleEnsure();
  }

  unregister(id: string) {
    delete this.nodes[id];
    if (this.current === id) {
      this.current = null;
      this.scheduleEnsure();
    }
  }

  subscribe(id: string, fn: Listener): () => void {
    const list = this.listeners[id] || (this.listeners[id] = []);
    list.push(fn);
    return () => {
      const l = this.listeners[id];
      if (!l) return;
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) delete this.listeners[id];
    };
  }

  isFocused(id: string) {
    return this.current === id;
  }

  /* --------------------------------------------------------------- focus */

  focus(id: string) {
    const node = this.nodes[id];
    if (!node || node.layer !== this.activeLayer()) return;
    const prev = this.current;
    this.memory[node.layer] = id;
    if (prev === id) return;
    this.current = id;
    if (prev) this.emit(prev, false);
    this.emit(id, true);
    if (node.cb.onFocus) node.cb.onFocus();
  }

  select() {
    const node = this.current ? this.nodes[this.current] : undefined;
    if (node && node.cb.onSelect) node.cb.onSelect();
  }

  move(dir: Dir): boolean {
    if (!this.isCurrentValid()) {
      this.ensure();
      return true;
    }
    const cur = this.nodes[this.current!]!;
    if (cur.cb.onArrow && cur.cb.onArrow(dir)) return true;
    const next = this.findNeighbor(cur, dir);
    if (next) this.focus(next.id);
    return !!next;
  }

  /* ----------------------------------------------------------- internes */

  private emit(id: string, focused: boolean) {
    const l = this.listeners[id];
    if (l) for (let i = 0; i < l.length; i++) l[i]!(focused);
  }

  private isCurrentValid(): boolean {
    const n = this.current ? this.nodes[this.current] : undefined;
    return !!n && n.layer === this.activeLayer();
  }

  private restore() {
    const layer = this.activeLayer();
    if (!layer) return;
    const mem = this.memory[layer];
    if (mem && this.nodes[mem]) this.focus(mem);
    else this.ensure();
  }

  /** Différé : laisse le temps à tous les nœuds d'un écran de s'inscrire. */
  private scheduleEnsure() {
    if (this.ensureTimer) return;
    this.ensureTimer = window.setTimeout(() => {
      this.ensureTimer = 0;
      this.ensure();
    }, 0);
  }

  private ensure() {
    if (this.isCurrentValid()) return;
    const layer = this.activeLayer();
    const inLayer: Node[] = [];
    for (const id in this.nodes) {
      const n = this.nodes[id]!;
      if (n.layer === layer) inLayer.push(n);
    }
    if (!inLayer.length) return;
    const mem = layer ? this.memory[layer] : undefined;
    let pick: Node | undefined;
    for (let i = 0; i < inLayer.length; i++) {
      const n = inLayer[i]!;
      if (n.id === mem) {
        pick = n;
        break;
      }
      if (n.autoFocus && !pick) pick = n;
    }
    if (!pick) {
      // Premier élément dans l'ordre du document.
      inLayer.sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1));
      pick = inLayer[0];
    }
    if (pick) this.focus(pick.id);
  }

  /**
   * Voisin le plus proche dans la direction : on ne garde que les candidats
   * situés au-delà du bord courant, puis on pondère fortement l'écart
   * orthogonal (pour rester « sur la même ligne » quand c'est possible).
   */
  private findNeighbor(cur: Node, dir: Dir): Node | null {
    const a = cur.el.getBoundingClientRect();
    let best: Node | null = null;
    let bestScore = Infinity;
    for (const id in this.nodes) {
      const n = this.nodes[id]!;
      if (n === cur || n.layer !== cur.layer) continue;
      const b = n.el.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      let main: number;
      let cross: number;
      switch (dir) {
        case 'right':
          main = b.left - a.right;
          cross = overlapGap(a.top, a.bottom, b.top, b.bottom);
          break;
        case 'left':
          main = a.left - b.right;
          cross = overlapGap(a.top, a.bottom, b.top, b.bottom);
          break;
        case 'down':
          main = b.top - a.bottom;
          cross = overlapGap(a.left, a.right, b.left, b.right);
          break;
        default:
          main = a.top - b.bottom;
          cross = overlapGap(a.left, a.right, b.left, b.right);
      }
      // Tolérance de quelques pixels pour les éléments qui se touchent / se chevauchent.
      if (main < -4) continue;
      const score = Math.max(main, 0) + cross * 3;
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }
}

/** 0 si les intervalles se chevauchent, sinon la distance qui les sépare. */
function overlapGap(a1: number, a2: number, b1: number, b2: number): number {
  if (b2 < a1) return a1 - b2;
  if (b1 > a2) return b1 - a2;
  return 0;
}

export const focus = new FocusManager();
