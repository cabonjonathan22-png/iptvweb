/**
 * Parseur XMLTV incrémental (guides TV de plusieurs centaines de Mo).
 *
 * On pousse le texte par morceaux ; seuls les blocs <channel>…</channel> et
 * <programme>…</programme> complets sont analysés, le reste du tampon est
 * conservé pour le morceau suivant. Pas de DOM, pas d'arbre : mémoire constante.
 */

export interface XmltvChannel {
  id: string;
  names: string[];
}

export interface XmltvProgramme {
  channel: string;
  start: number;
  stop: number;
  title: string;
  desc: string | null;
}

export interface XmltvHandlers {
  onChannel?: (c: XmltvChannel) => void;
  onProgramme: (p: XmltvProgramme) => void;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e.charAt(0) === '#') {
      const code = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function text(inner: string): string {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(inner.trim());
  return (cdata ? cdata[1]! : decodeEntities(inner.replace(/<[^>]+>/g, ''))).trim();
}

/** « 20240101120000 +0100 » -> ms epoch (fuseau facultatif, UTC par défaut). */
export function parseXmltvDate(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-]\d{2}):?(\d{2})?)?$/.exec(s.trim());
  if (!m) return NaN;
  const utc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] || 0));
  if (!m[7]) return utc;
  const sign = m[7].charAt(0) === '-' ? -1 : 1;
  const offset = sign * (Math.abs(parseInt(m[7], 10)) * 60 + parseInt(m[8] || '0', 10));
  return utc - offset * 60_000;
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : null;
}

/** Première balise <name>…</name> (préférence pour lang="fr" quand il y en a plusieurs). */
function child(block: string, name: string): string | null {
  const re = new RegExp('<' + name + '(\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'g');
  let first: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const value = text(m[2]!);
    if (first === null) first = value;
    if (m[1] && /lang\s*=\s*["']fr/i.test(m[1])) return value;
  }
  return first;
}

export function createXmltvParser(h: XmltvHandlers) {
  let buf = '';

  const drain = () => {
    let pos = 0;
    for (;;) {
      const p = buf.indexOf('<programme', pos);
      const c = h.onChannel ? buf.indexOf('<channel', pos) : -1;
      const isChan = c >= 0 && (p < 0 || c < p);
      const start = isChan ? c : p;
      if (start < 0) {
        // Garde une fin de tampon qui pourrait contenir le début d'une balise.
        pos = Math.max(pos, buf.length - 12);
        break;
      }
      const close = isChan ? '</channel>' : '</programme>';
      const end = buf.indexOf(close, start);
      if (end < 0) {
        pos = start;
        break;
      }
      const block = buf.slice(start, end + close.length);
      pos = end + close.length;
      const openEnd = block.indexOf('>');
      const openTag = block.slice(0, openEnd + 1);
      if (isChan) {
        const id = attr(openTag, 'id');
        if (id) {
          const names: string[] = [];
          const re = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(block))) names.push(text(m[1]!));
          h.onChannel!({ id, names });
        }
      } else {
        const channel = attr(openTag, 'channel');
        const start = parseXmltvDate(attr(openTag, 'start') || '');
        const stop = parseXmltvDate(attr(openTag, 'stop') || '');
        const title = child(block, 'title');
        if (channel && isFinite(start) && isFinite(stop) && stop > start && title) {
          h.onProgramme({ channel, start, stop, title, desc: child(block, 'desc') });
        }
      }
    }
    buf = buf.slice(pos);
  };

  return {
    push(chunk: string) {
      buf += chunk;
      drain();
    },
    end() {
      drain();
      buf = '';
    },
  };
}
