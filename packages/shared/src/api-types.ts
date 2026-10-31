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
