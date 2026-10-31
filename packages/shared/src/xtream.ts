/**
 * Xtream Codes : construction des URL et types des réponses `player_api.php`.
 * Les panels renvoient indifféremment nombres ou chaînes : tout passe par
 * `num()` / `str()` avant usage.
 */

export interface XtreamCreds {
  server: string;
  username: string;
  password: string;
}

/** "panel.tv:8080/" -> "http://panel.tv:8080" ; retire un éventuel chemin get.php / player_api.php. */
export function normalizeServer(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/(player_api|get|xmltv)\.php.*$/i, '');
  return s.replace(/\/+$/, '');
}

const enc = encodeURIComponent;

export function xtreamApiUrl(c: XtreamCreds, action?: string, params?: Record<string, string | number>): string {
  let u = c.server + '/player_api.php?username=' + enc(c.username) + '&password=' + enc(c.password);
  if (action) u += '&action=' + enc(action);
  if (params) for (const k in params) u += '&' + enc(k) + '=' + enc(String(params[k]));
  return u;
}

const seg = (c: XtreamCreds) => enc(c.username) + '/' + enc(c.password);

export const xtreamLiveUrl = (c: XtreamCreds, id: number | string, ext: 'm3u8' | 'ts' = 'm3u8') =>
  c.server + '/live/' + seg(c) + '/' + id + '.' + ext;
export const xtreamVodUrl = (c: XtreamCreds, id: number | string, ext: string) =>
  c.server + '/movie/' + seg(c) + '/' + id + '.' + (ext || 'mp4');
export const xtreamEpisodeUrl = (c: XtreamCreds, id: number | string, ext: string) =>
  c.server + '/series/' + seg(c) + '/' + id + '.' + (ext || 'mp4');
export const xtreamXmltvUrl = (c: XtreamCreds) =>
  c.server + '/xmltv.php?username=' + enc(c.username) + '&password=' + enc(c.password);

/** Reconnaît une URL M3U de panel Xtream (get.php?username=…&password=…). */
export function xtreamFromM3uUrl(url: string): XtreamCreds | null {
  const m = /^(https?:\/\/[^/]+)\/get\.php\?(.*)$/i.exec(url.trim());
  if (!m) return null;
  const q: Record<string, string> = {};
  m[2]!.split('&').forEach((kv) => {
    const eq = kv.indexOf('=');
    if (eq > 0) q[kv.slice(0, eq)] = decodeURIComponent(kv.slice(eq + 1));
  });
  return q.username && q.password ? { server: m[1]!, username: q.username, password: q.password } : null;
}

/* ------------------------------------------------------------------ Types */

type N = number | string | null | undefined;

export interface XtreamUserInfo {
  auth: N;
  status?: string;
  exp_date?: N;
  max_connections?: N;
  active_cons?: N;
  message?: string;
}

export interface XtreamCategory {
  category_id: N;
  category_name: string;
  parent_id?: N;
}

export interface XtreamLiveStream {
  num?: N;
  name: string;
  stream_id: N;
  stream_icon?: string | null;
  epg_channel_id?: string | null;
  added?: N;
  category_id?: N;
  tv_archive?: N;
  tv_archive_duration?: N;
}

export interface XtreamVodStream {
  num?: N;
  name: string;
  stream_id: N;
  stream_icon?: string | null;
  rating?: N;
  added?: N;
  category_id?: N;
  container_extension?: string | null;
}

export interface XtreamSeries {
  num?: N;
  name: string;
  series_id: N;
  cover?: string | null;
  plot?: string | null;
  cast?: string | null;
  genre?: string | null;
  releaseDate?: string | null;
  release_date?: string | null;
  last_modified?: N;
  rating?: N;
  backdrop_path?: string[] | string | null;
  category_id?: N;
}

export function num(v: N): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : null;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Date Xtream (timestamp Unix en secondes, en chaîne ou nombre). */
export function unixDate(v: N): Date | null {
  const n = num(v);
  return n && n > 0 ? new Date(n * 1000) : null;
}

export function yearOf(s: string | null | undefined): number | null {
  const m = s ? /(19|20)\d{2}/.exec(s) : null;
  return m ? parseInt(m[0], 10) : null;
}
