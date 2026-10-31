import type { TvChannel } from '@iptv/shared';
import { api } from '../../lib/api';

const PAGE = 100;

/**
 * Accès paginé aux chaînes d'une catégorie : les pages (100 chaînes) sont
 * chargées à la demande quand la liste virtualisée les affiche. La TV ne
 * télécharge jamais la playlist entière.
 */
export class ChannelSource {
  total = -1;
  error: string | null = null;
  private pages: { [page: number]: TvChannel[] } = {};
  private pending: { [page: number]: Promise<void> } = {};
  private disposed = false;

  constructor(
    readonly category: number | 'all',
    private onChange: () => void,
  ) {}

  dispose() {
    this.disposed = true;
  }

  get(i: number): TvChannel | undefined {
    const page = this.pages[Math.floor(i / PAGE)];
    return page ? page[i % PAGE] : undefined;
  }

  /** Charge la page contenant l'index i si besoin. */
  ensure(i: number): Promise<void> {
    const p = Math.floor(i / PAGE);
    if (this.pages[p]) return Promise.resolve();
    if (!this.pending[p]) {
      this.pending[p] = api
        .liveChannels(this.category, p * PAGE, PAGE)
        .then((res) => {
          if (this.disposed) return;
          this.total = res.total;
          this.pages[p] = res.items;
          this.error = null;
          this.onChange();
        })
        .catch((e: Error) => {
          delete this.pending[p];
          if (this.disposed) return;
          this.error = e.message || 'Erreur réseau';
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

  async at(i: number): Promise<TvChannel | undefined> {
    await this.ensure(i);
    return this.get(i);
  }
}
