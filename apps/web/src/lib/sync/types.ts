import type { DB } from '../db';
import type { schema } from '../db';
import type { PlaylistMeta } from '../db/schema';
import type { ContentWriter } from './writer';

export type Playlist = typeof schema.playlists.$inferSelect;
export type SyncJob = typeof schema.syncJobs.$inferSelect;

export interface PhaseCtx {
  db: DB;
  playlist: Playlist;
  job: SyncJob;
  writer: ContentWriter;
  /** true quand il faut rendre la main (limite de durée de la fonction). */
  timeUp: () => boolean;
  /** Enregistre la progression (éléments traités) et prolonge le bail. */
  checkpoint: (cursor: number) => Promise<void>;
  patchMeta: (m: Partial<PlaylistMeta>) => void;
  /** Métadonnées courantes (y compris celles découvertes pendant cette synchro). */
  meta: () => PlaylistMeta;
}

/** 'next' : phase terminée ; 'continue' : à reprendre dans une nouvelle invocation. */
export type PhaseResult = 'next' | 'continue';
export type PhaseHandler = (ctx: PhaseCtx) => Promise<PhaseResult>;

/** Taille des lots d'écriture : ~1000 lignes × 14 colonnes, sous la limite de 65 535 paramètres. */
export const BATCH = 1000;
