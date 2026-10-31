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
  /** Avertissement non bloquant (ex. flux http sur page https sans proxy configuré). */
  warning?: 'mixed_content';
}

export type PlayKind = 'live' | 'vod' | 'episode';
