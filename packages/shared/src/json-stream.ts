/**
 * Lecture en flux d'un tableau JSON d'objets : `[{…},{…},…]`.
 * Chaque objet de premier niveau est découpé puis parsé dès qu'il est complet,
 * sans jamais construire le tableau entier (les réponses Xtream
 * get_live_streams / get_vod_streams dépassent souvent 20 Mo).
 *
 * Si la racine n'est pas un tableau (erreur Xtream, `{"user_info":…}`), le
 * document entier est conservé et rendu par `end()`.
 */
export function createJsonArrayStream(onItem: (item: unknown) => void) {
  let mode: 'start' | 'array' | 'other' | 'done' = 'start';
  let depth = 0;
  let inStr = false;
  let esc = false;
  let item = '';
  let other = '';

  return {
    push(chunk: string) {
      let i = 0;
      if (mode === 'start') {
        while (i < chunk.length && /\s/.test(chunk.charAt(i))) i++;
        if (i === chunk.length) return;
        if (chunk.charAt(i) === '[') {
          mode = 'array';
          i++;
        } else mode = 'other';
      }
      if (mode === 'other') {
        other += chunk.slice(i);
        return;
      }
      if (mode !== 'array') return;

      let start = depth > 0 ? i : -1;
      for (; i < chunk.length; i++) {
        const c = chunk.charCodeAt(i);
        if (inStr) {
          if (esc) esc = false;
          else if (c === 92 /* \ */) esc = true;
          else if (c === 34 /* " */) inStr = false;
          continue;
        }
        if (c === 34) {
          inStr = true;
        } else if (c === 123 /* { */ || c === 91 /* [ */) {
          if (depth === 0) start = i;
          depth++;
        } else if (c === 125 /* } */ || c === 93 /* ] */) {
          if (depth === 0) {
            // `]` final du tableau racine.
            mode = 'done';
            return;
          }
          depth--;
          if (depth === 0) {
            item += chunk.slice(start, i + 1);
            start = -1;
            onItem(JSON.parse(item));
            item = '';
          }
        }
      }
      if (depth > 0 && start >= 0) item += chunk.slice(start);
    },
    /** Retourne la racine si ce n'était pas un tableau. */
    end(): unknown {
      if (mode === 'other') return other.trim() ? JSON.parse(other) : null;
      if (mode === 'array' && depth > 0) throw new Error('JSON tronqué');
      return undefined;
    },
    isArray: () => mode === 'array' || mode === 'done',
  };
}
