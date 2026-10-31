/** Contrats des endpoints consommés par l'app TV. */

export interface PairStartResponse {
  code: string;
  /** Secret connu de la seule TV : empêche un tiers qui devine le code de récupérer le token. */
  secret: string;
  expiresAt: number;
  linkUrl: string;
  /** QR code pré-rendu en SVG (évite d'embarquer une lib QR dans le bundle TV). */
  qrSvg: string;
}

export type PairStatusResponse =
  | { status: 'pending'; expiresAt: number }
  | { status: 'expired' }
  | { status: 'linked'; token: string; device: TvDevice };

export interface TvDevice {
  id: string;
  name: string;
  playlistId: string | null;
}

export interface TvMeResponse {
  device: TvDevice;
  account: { email: string | null };
  playlist: { id: string; name: string; status: string } | null;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
}

export interface Page<T> {
  total: number;
  offset: number;
  items: T[];
}

export interface TvCategory {
  id: number;
  name: string;
  count: number;
  locked: boolean;
}

export interface TvChannel {
  id: number;
  num: number | null;
  name: string;
  /** URL absolue (proxy d'images signé) ou null. */
  logo: string | null;
  epgId: string | null;
  catchup: boolean;
}

export type StreamType = 'hls' | 'ts' | 'mp4' | 'mkv';

export interface PlayResponse {
  url: string;
  type: StreamType;
  live: boolean;
  /** true si la lecture passe par le proxy de flux. */
  proxied: boolean;
  /** Conteneur converti à la volée par le proxy (MKV…) : racine pour la position et l'audio. */
  remux?: { base: string };
  /** Avertissement non bloquant (ex. flux http sur page https sans proxy configuré). */
  warning?: 'mixed_content';
}

export type PlayKind = 'live' | 'vod' | 'episode';

/* ------------------------------------------------- Films, séries, épisodes */

export type ContentKindApi = 'live' | 'vod' | 'series';

export interface PosterCard {
  id: number;
  name: string;
  poster: string | null;
  year: number | null;
  rating: number | null;
}

export interface Progress {
  position: number;
  duration: number | null;
  completed: boolean;
}

export interface MovieDetail extends PosterCard {
  backdrop: string | null;
  plot: string | null;
  cast: string | null;
  director: string | null;
  genre: string | null;
  durationSec: number | null;
  containerExt: string | null;
  favorite: boolean;
  progress: Progress | null;
}

export interface Episode {
  id: number;
  season: number;
  episode: number;
  title: string | null;
  plot: string | null;
  thumb: string | null;
  durationSec: number | null;
  progress: Progress | null;
}

export interface SeriesDetail extends PosterCard {
  backdrop: string | null;
  plot: string | null;
  cast: string | null;
  genre: string | null;
  favorite: boolean;
  seasons: { season: number; episodes: Episode[] }[];
  /** Épisode à reprendre / suivant à regarder. */
  resume: { episodeId: number; position: number } | null;
}

/* ------------------------------------------------------------------- EPG */

export interface EpgProgram {
  start: number;
  stop: number;
  title: string;
  desc: string | null;
}

export interface EpgNowNext {
  now: EpgProgram | null;
  next: EpgProgram | null;
}

export interface EpgGridRow {
  channel: TvChannel;
  programs: EpgProgram[];
}

/* ---------------------------------------------------------- Accueil, recherche */

export interface ContinueItem {
  kind: 'vod' | 'episode';
  id: number;
  /** Film, ou série pour un épisode. */
  parentId: number;
  name: string;
  subtitle: string | null;
  image: string | null;
  progress: Progress;
}

export interface HomeResponse {
  continue: ContinueItem[];
  favoriteChannels: TvChannel[];
  recentChannels: TvChannel[];
  recentMovies: PosterCard[];
  series: PosterCard[];
}

export interface SearchResponse {
  channels: TvChannel[];
  movies: PosterCard[];
  series: PosterCard[];
}

/* ------------------------------------------------------- Réglages, parental */

export interface TvSettings {
  audioLang: string | null;
  subtitleLang: string | null;
  playerMode: 'auto' | 'hls' | 'ts';
  livePreview: boolean;
  hasPin: boolean;
  /** Langues de contenu à afficher (codes) ; vide = toutes. */
  contentLangs: string[];
}

export interface ContentLanguage {
  code: string;
  label: string;
  /** Nombre de catégories de la playlist dans cette langue. */
  categories: number;
}

/* ------------------------------------------- Télécommande, reprise, envoi */

export type RemoteKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'playPause' | 'chUp' | 'chDown';

export type RemoteCommand =
  | { type: 'wake' }
  | { type: 'key'; key: RemoteKey }
  | { type: 'live'; channel: TvChannel }
  | { type: 'vod'; id: number; startAt: number }
  | { type: 'episode'; id: number; seriesId: number; startAt: number };

export interface RemoteTarget {
  id: string;
  name: string;
}

/** Lecture en cours ou récente sur un autre appareil du compte. */
export type Handoff =
  | { kind: 'live'; deviceName: string; channel: TvChannel }
  | { kind: 'vod'; deviceName: string; id: number; name: string; subtitle: null; position: number }
  | { kind: 'episode'; deviceName: string; id: number; seriesId: number; name: string; subtitle: string; position: number };

export interface PlaylistSummary {
  id: string;
  name: string;
  status: string;
  active: boolean;
}
