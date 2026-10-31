/**
 * Classification Live / Films / Séries des entrées M3U (les playlists Xtream
 * sont classées par l'API elle-même). Ordre des indices, du plus fiable au moins fiable :
 *  1. chemin d'URL Xtream (/live/, /movie/, /series/) ;
 *  2. extension de fichier vidéo (VOD) + motif SxxEyy dans le nom (série) ;
 *  3. mots-clés du group-title, seulement si l'URL ne ressemble pas à un flux live.
 */
import type { M3uEntry } from './m3u';

export type ContentKind = 'live' | 'vod' | 'series';

const VOD_EXT = /\.(mp4|mkv|avi|mov|wmv|m4v|webm|flv|mpe?g|divx|xvid)(\?|$)/i;
const LIVE_EXT = /\.(m3u8|ts)(\?|$)/i;
const SERIES_GROUP = /s[ée]ries?|tv ?shows?|serien|feuilletons?/i;
const VOD_GROUP = /\bvod\b|\bfilms?\b|\bmovies?\b|\bpel[ií]culas?\b|\bkino\b/i;

export interface EpisodeInfo {
  series: string;
  season: number;
  episode: number;
}

/** « Breaking Bad S01E02 », « Breaking Bad - S1 E2 », « Breaking.Bad.1x02 ». */
export function parseEpisode(name: string): EpisodeInfo | null {
  const m =
    /^(.*?)[\s._\-–|:]*\bS(\d{1,2})[\s._-]*E(\d{1,3})\b/i.exec(name) ||
    /^(.*?)[\s._\-–|:]*\b(\d{1,2})x(\d{2,3})\b/i.exec(name);
  if (!m) return null;
  const series = m[1]!.replace(/[._]+/g, ' ').replace(/[\s\-–|:]+$/, '').trim();
  if (!series) return null;
  return { series, season: parseInt(m[2]!, 10), episode: parseInt(m[3]!, 10) };
}

export function classifyM3u(e: Pick<M3uEntry, 'url' | 'name' | 'group'>): ContentKind {
  const u = e.url.toLowerCase();
  if (u.indexOf('/series/') >= 0) return 'series';
  if (u.indexOf('/movie/') >= 0 || u.indexOf('/movies/') >= 0) return 'vod';
  if (u.indexOf('/live/') >= 0) return 'live';

  const ep = parseEpisode(e.name);
  const g = e.group || '';
  if (VOD_EXT.test(u)) return ep || SERIES_GROUP.test(g) ? 'series' : 'vod';
  if (LIVE_EXT.test(u)) return 'live';
  if (SERIES_GROUP.test(g) && ep) return 'series';
  if (VOD_GROUP.test(g)) return ep ? 'series' : 'vod';
  return 'live';
}
