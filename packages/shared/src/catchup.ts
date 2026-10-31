/**
 * Replay (catch-up) : URL d'un programme passé, pour Xtream et pour les
 * conventions M3U (attributs `catchup`, `catchup-source`).
 */
import type { XtreamCreds } from './xtream';

export interface CatchupWindow {
  /** Millisecondes. */
  start: number;
  stop: number;
}

const p2 = (n: number) => (n < 10 ? '0' + n : String(n));
const sec = (ms: number) => Math.floor(ms / 1000);

/** « 2026-10-31:18-30 », à l'heure du serveur du fournisseur (UTC si fuseau inconnu). */
export function xtreamStamp(ms: number, timeZone?: string | null): string {
  const parts = (zone: string) => {
    const out: Record<string, string> = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(ms))
      .forEach((p) => (out[p.type] = p.value));
    return out;
  };
  let d: Record<string, string>;
  try {
    d = parts(timeZone || 'UTC');
  } catch (_) {
    d = parts('UTC'); // fuseau inconnu de cet environnement
  }
  return d.year + '-' + d.month + '-' + d.day + ':' + d.hour + '-' + d.minute;
}

const minutes = (w: CatchupWindow) => Math.max(1, Math.ceil((w.stop - w.start) / 60_000));

export function xtreamCatchupUrl(c: XtreamCreds, id: number | string, w: CatchupWindow, ext: 'ts' | 'm3u8', timeZone?: string | null): string {
  const seg = encodeURIComponent(c.username) + '/' + encodeURIComponent(c.password);
  return c.server + '/timeshift/' + seg + '/' + minutes(w) + '/' + xtreamStamp(w.start, timeZone) + '/' + id + '.' + ext;
}

/** Date en UTC selon un motif de lettres : Y m d H M S. */
function formatUtc(ms: number, pattern: string): string {
  const d = new Date(ms);
  const map: Record<string, string> = {
    Y: String(d.getUTCFullYear()),
    m: p2(d.getUTCMonth() + 1),
    d: p2(d.getUTCDate()),
    H: p2(d.getUTCHours()),
    M: p2(d.getUTCMinutes()),
    S: p2(d.getUTCSeconds()),
  };
  return pattern.replace(/[YmdHMS]/g, (c) => map[c]!);
}

function fillTemplate(tpl: string, w: CatchupWindow, now: number): string {
  const duration = sec(w.stop - w.start);
  const stamps: Record<string, number> = {
    utc: sec(w.start),
    start: sec(w.start),
    lutc: sec(now),
    now: sec(now),
    timestamp: sec(now),
    end: sec(w.stop),
    utcend: sec(w.stop),
    duration,
    offset: sec(now - w.start),
  };
  return tpl
    .replace(/\$?\{(utc|start|end|utcend|lutc|now|timestamp):([^}]+)\}/g, (_, k: string, fmt: string) => formatUtc(stamps[k]! * 1000, fmt))
    .replace(/\$?\{duration:(\d+)\}/g, (_, div: string) => String(Math.floor(duration / Number(div))))
    .replace(/\$?\{(utc|start|end|utcend|lutc|now|timestamp|duration|offset)\}/g, (_, k: string) => String(stamps[k]))
    .replace(/\{([YmdHMS])\}/g, (_, c: string) => formatUtc(w.start, c));
}

/** URL de replay d'une chaîne M3U, ou null si la convention n'est pas exploitable. */
export function m3uCatchupUrl(
  streamUrl: string,
  type: string | null | undefined,
  source: string | null | undefined,
  w: CatchupWindow,
  now: number = Date.now(),
): string | null {
  const t = (type || '').toLowerCase();
  if (t === 'xc') {
    const m = /^(https?:\/\/[^/]+)\/(?:live\/)?([^/]+)\/([^/]+)\/(\d+)(?:\.(\w+))?$/.exec(streamUrl);
    if (!m) return null;
    const ext = m[5] === 'm3u8' ? 'm3u8' : 'ts';
    return m[1] + '/timeshift/' + m[2] + '/' + m[3] + '/' + minutes(w) + '/' + xtreamStamp(w.start) + '/' + m[4] + '.' + ext;
  }
  if (t === 'flussonic' || t === 'fs' || t === 'flussonic-hls') {
    const dur = sec(w.stop - w.start);
    if (/\.m3u8(\?|$)/.test(streamUrl)) return streamUrl.replace(/\/[^/?]+\.m3u8/, '/index-' + sec(w.start) + '-' + dur + '.m3u8');
    return streamUrl.replace(/\/[^/?]*(\?|$)/, '/timeshift_abs-' + sec(w.start) + '.ts$1');
  }
  if (t === 'shift') {
    return streamUrl + (streamUrl.indexOf('?') >= 0 ? '&' : '?') + 'utc=' + sec(w.start) + '&lutc=' + sec(now);
  }
  if (!source) return null;
  if (t === 'append') return streamUrl + fillTemplate(source, w, now);
  // « default », « vod », ou pas de type : la source remplace l'URL.
  return fillTemplate(source, w, now);
}
