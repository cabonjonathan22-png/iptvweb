import type { Page } from '@iptv/shared';
import { ApiError } from './api';

const PAGE = 100;

/**
 * Accès paginé à une liste serveur (chaînes, films, séries) : les pages sont
 * chargées à la demande quand la liste virtualisée les affiche. La TV ne
 * télécharge jamais une liste entière.
 */
export class PagedSource<T> {
  total = -1;
  error: ApiError | null = null;
  private pages: { [page: number]: T[] } = {};
  private pending: { [page: number]: Promise<void> } = {};
  private disposed = false;

  constructor(
    readonly key: string,
    private fetchPage: (offset: number, limit: number) => Promise<Page<T>>,
    private onChange: () => void,
  ) {}

  dispose() {
    this.disposed = true;
  }

  get(i: number): T | undefined {
    const page = this.pages[Math.floor(i / PAGE)];
    return page ? page[i % PAGE] : undefined;
  }

  ensure(i: number): Promise<void> {
    const p = Math.floor(i / PAGE);
    if (this.pages[p]) return Promise.resolve();
    if (!this.pending[p]) {
      this.pending[p] = this.fetchPage(p * PAGE, PAGE)
        .then((res) => {
          if (this.disposed) return;
          this.total = res.total;
          this.pages[p] = res.items;
          this.error = null;
          this.onChange();
        })
        .catch((e: ApiError) => {
          delete this.pending[p];
          if (this.disposed) return;
          this.error = e;
          this.onChange();
        });
    }
    return this.pending[p]!;
  }

  /** Charge autour d'une plage visible (et la page suivante en avance). */
  ensureRange(from: number, to: number) {
    for (let p = Math.floor(Math.max(0, from) / PAGE); p <= Math.floor((to + PAGE / 2) / PAGE); p++) {
      if (this.total >= 0 && p * PAGE >= this.total) break;
      this.ensure(p * PAGE);
    }
  }

  async at(i: number): Promise<T | undefined> {
    await this.ensure(i);
    return this.get(i);
  }

  /** Éléments déjà chargés dans [from, to). */
  loaded(from: number, to: number): T[] {
    const out: T[] = [];
    for (let i = Math.max(0, from); i < to; i++) {
      const x = this.get(i);
      if (x) out.push(x);
    }
    return out;
  }
}
