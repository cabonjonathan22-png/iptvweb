/**
 * Enrichissement optionnel via TMDB (TMDB_API_KEY : clé v3 ou jeton v4) pour
 * les films / séries mal renseignés par la playlist : synopsis, affiche,
 * fond, note, casting. Résultats en français quand ils existent.
 */
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';

export interface TmdbInfo {
  tmdbId: number;
  plot: string | null;
  poster: string | null;
  backdrop: string | null;
  rating: number | null;
  year: number | null;
  cast: string | null;
  director: string | null;
  genre: string | null;
}

export const tmdbEnabled = () => Boolean(process.env.TMDB_API_KEY);

async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const key = process.env.TMDB_API_KEY!;
  const v4 = key.length > 40;
  const qs = new URLSearchParams({ language: 'fr-FR', ...params, ...(v4 ? {} : { api_key: key }) });
  try {
    const res = await fetch(API + path + '?' + qs, {
      headers: v4 ? { Authorization: 'Bearer ' + key } : {},
      signal: AbortSignal.timeout(6000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** « FR - Inception (2010) [MULTI] 4K » -> « Inception » */
export function cleanTitle(name: string): string {
  return name
    .replace(/^\s*(\|[^|]*\||[A-Z]{2,3}\s*[-:|]\s+)/, '')
    .replace(/[([](19|20)\d{2}[)\]]/g, '')
    .replace(/\[[^\]]*\]|\b(4k|uhd|fhd|hd|multi|vostfr|vf|hevc|x26[45])\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface SearchResult {
  results?: { id: number }[];
}
interface Details {
  id: number;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  genres?: { name: string }[];
  credits?: { cast?: { name: string }[]; crew?: { job: string; name: string }[] };
}

export async function tmdbLookup(kind: 'movie' | 'tv', name: string, year: number | null): Promise<TmdbInfo | null> {
  if (!tmdbEnabled()) return null;
  const query = cleanTitle(name);
  if (!query) return null;
  const params: Record<string, string> = { query };
  if (year) params[kind === 'movie' ? 'year' : 'first_air_date_year'] = String(year);
  const found = await get<SearchResult>('/search/' + kind, params);
  const id = found?.results?.[0]?.id;
  if (!id) return null;
  const d = await get<Details>('/' + kind + '/' + id, { append_to_response: 'credits' });
  if (!d) return null;
  const date = d.release_date || d.first_air_date || '';
  return {
    tmdbId: d.id,
    plot: d.overview || null,
    poster: d.poster_path ? IMG + 'w342' + d.poster_path : null,
    backdrop: d.backdrop_path ? IMG + 'w1280' + d.backdrop_path : null,
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    year: date ? parseInt(date.slice(0, 4), 10) || null : null,
    cast: d.credits?.cast?.slice(0, 8).map((c) => c.name).join(', ') || null,
    director: d.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
    genre: d.genres?.map((g) => g.name).join(', ') || null,
  };
}
