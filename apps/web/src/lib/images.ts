import { sign } from './signing';

/** logo : PNG (transparence) ; poster : JPEG. */
export type ImageKind = 'logo' | 'poster' | 'backdrop';

export const IMAGE_WIDTHS: Record<ImageKind, number[]> = {
  logo: [64, 96, 160],
  poster: [240, 360],
  backdrop: [960, 1280],
};

/**
 * URL absolue du proxy d'images pour une image tierce (souvent en http://).
 * Signée : seules les images référencées par nos playlists passent par le proxy.
 */
export function imageUrl(origin: string, raw: string | null | undefined, kind: ImageKind, width: number): string | null {
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  const data = kind + '|' + width + '|' + raw;
  return (
    origin +
    '/api/img?k=' + kind +
    '&w=' + width +
    '&u=' + encodeURIComponent(raw) +
    '&s=' + sign('img', data)
  );
}
