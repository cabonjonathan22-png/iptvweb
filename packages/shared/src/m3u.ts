/**
 * Parseur M3U / M3U8 incrémental.
 *
 * On lui pousse le texte par morceaux (`push`) au fil du téléchargement : il ne
 * garde en mémoire que la ligne en cours et l'entrée en construction. Une
 * playlist de 100 000 entrées se parse donc à mémoire constante.
 *
 * Gère : #EXTM3U (url-tvg / x-tvg-url), #EXTINF (durée, attributs entre
 * guillemets ou non, virgules dans les attributs), #EXTGRP, #EXTVLCOPT
 * (http-user-agent, http-referrer), #EXTHTTP (JSON), options Kodi après « | »,
 * BOM, fins de ligne CRLF, URL nues sans #EXTINF.
 */

export interface M3uEntry {
  name: string;
  url: string;
  duration: number;
  tvgId?: string;
  tvgName?: string;
  tvgLogo?: string;
  tvgChno?: number;
  group?: string;
  catchup?: string;
  catchupDays?: number;
  catchupSource?: string;
  userAgent?: string;
  referrer?: string;
}

export interface M3uHeader {
  epgUrl?: string;
}

export interface M3uHandlers {
  onHeader?: (h: M3uHeader) => void;
  onEntry: (e: M3uEntry) => void;
}

const ATTR_RE = /([A-Za-z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|([^\s"',]+))/g;

export function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(s))) {
    out[m[1]!.toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '').trim();
  }
  return out;
}

/** Index de la première virgule hors guillemets (séparateur attributs / titre). */
function titleComma(s: string): number {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === ',') return i;
  }
  return -1;
}

const int = (v: string | undefined) => {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return isFinite(n) ? n : undefined;
};

type Pending = Omit<M3uEntry, 'url'>;

export function createM3uParser(h: M3uHandlers) {
  let buf = '';
  let first = true;
  let pending: Pending | null = null;
  let opts: { userAgent?: string; referrer?: string } = {};

  const applyHttpOpt = (key: string, value: string) => {
    const k = key.toLowerCase();
    if (k === 'http-user-agent' || k === 'user-agent') opts.userAgent = value;
    else if (k === 'http-referrer' || k === 'http-referer' || k === 'referer' || k === 'referrer') opts.referrer = value;
  };

  const emit = (rawUrl: string) => {
    let url = rawUrl;
    // Options Kodi : http://…/stream.ts|User-Agent=xxx&Referer=yyy
    const pipe = url.indexOf('|');
    if (pipe > 0) {
      const tail = url.slice(pipe + 1);
      url = url.slice(0, pipe);
      tail.split('&').forEach((kv) => {
        const eq = kv.indexOf('=');
        if (eq > 0) applyHttpOpt(kv.slice(0, eq), safeDecode(kv.slice(eq + 1)));
      });
    }
    const p: Pending = pending || { name: nameFromUrl(url), duration: -1 };
    const e: M3uEntry = { ...p, url };
    if (opts.userAgent && !e.userAgent) e.userAgent = opts.userAgent;
    if (opts.referrer && !e.referrer) e.referrer = opts.referrer;
    pending = null;
    opts = {};
    h.onEntry(e);
  };

  const line = (raw: string) => {
    let l = raw;
    if (first) {
      if (l.charCodeAt(0) === 0xfeff) l = l.slice(1);
    }
    l = l.trim();
    if (!l) return;
    if (first) {
      first = false;
      if (l.startsWith('#EXTM3U')) {
        const a = parseAttrs(l.slice(7));
        const epg = a['url-tvg'] || a['x-tvg-url'] || a['tvg-url'];
        if (h.onHeader) h.onHeader({ epgUrl: epg ? epg.split(',')[0]!.trim() : undefined });
        return;
      }
    }
    if (l.charAt(0) === '#') {
      if (l.startsWith('#EXTINF:')) {
        const body = l.slice(8);
        const comma = titleComma(body);
        const head = comma >= 0 ? body.slice(0, comma) : body;
        const title = comma >= 0 ? body.slice(comma + 1).trim() : '';
        const sp = head.search(/\s/);
        const duration = parseFloat(sp >= 0 ? head.slice(0, sp) : head);
        const a = parseAttrs(sp >= 0 ? head.slice(sp) : '');
        pending = {
          name: title || a['tvg-name'] || '',
          duration: isFinite(duration) ? duration : -1,
          tvgId: a['tvg-id'] || undefined,
          tvgName: a['tvg-name'] || undefined,
          tvgLogo: a['tvg-logo'] || a['logo'] || undefined,
          tvgChno: int(a['tvg-chno'] || a['channel-number']),
          group: a['group-title'] || undefined,
          catchup: a['catchup'] || a['catchup-type'] || undefined,
          catchupDays: int(a['catchup-days'] || a['timeshift']),
          catchupSource: a['catchup-source'] || undefined,
          userAgent: a['user-agent'] || a['http-user-agent'] || undefined,
          referrer: a['referrer'] || a['http-referrer'] || undefined,
        };
      } else if (l.startsWith('#EXTGRP:')) {
        if (pending && !pending.group) pending.group = l.slice(8).trim();
      } else if (l.startsWith('#EXTVLCOPT:')) {
        const kv = l.slice(11);
        const eq = kv.indexOf('=');
        if (eq > 0) applyHttpOpt(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
      } else if (l.startsWith('#EXTHTTP:')) {
        try {
          const o = JSON.parse(l.slice(9)) as Record<string, string>;
          for (const k in o) applyHttpOpt(k, String(o[k]));
        } catch (_) {
          /* JSON invalide : ignoré */
        }
      }
      return;
    }
    emit(l);
  };

  return {
    push(chunk: string) {
      buf += chunk;
      let start = 0;
      let idx: number;
      while ((idx = buf.indexOf('\n', start)) !== -1) {
        line(buf.slice(start, idx));
        start = idx + 1;
      }
      buf = buf.slice(start);
    },
    end() {
      if (buf) line(buf);
      buf = '';
    },
  };
}

/** Parse une playlist complète (tests, petits fichiers). */
export function parseM3u(text: string): { header: M3uHeader; entries: M3uEntry[] } {
  const entries: M3uEntry[] = [];
  let header: M3uHeader = {};
  const p = createM3uParser({ onHeader: (h) => (header = h), onEntry: (e) => entries.push(e) });
  p.push(text);
  p.end();
  return { header, entries };
}

function nameFromUrl(url: string): string {
  const path = url.split('?')[0]!.split('#')[0]!;
  const last = path.slice(path.lastIndexOf('/') + 1);
  return safeDecode(last) || url;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}
