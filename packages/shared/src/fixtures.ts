/**
 * Générateur de playlists factices (tests unitaires, e2e, serveur de dev).
 * Mélange réaliste : chaînes live, films, épisodes de séries.
 */
export interface FixtureOptions {
  count: number;
  baseUrl?: string;
  /** Style d'URL Xtream (/live/, /movie/, /series/) ou URLs « génériques ». */
  xtreamPaths?: boolean;
}

export function* generateM3uLines(o: FixtureOptions): Generator<string> {
  const base = o.baseUrl || 'http://example.test';
  yield '#EXTM3U url-tvg="' + base + '/epg.xml" x-tvg-url="' + base + '/epg.xml"';
  for (let i = 0; i < o.count; i++) {
    const r = i % 10;
    if (r < 6) {
      const g = 'Live ' + ((i % 12) + 1);
      yield '#EXTINF:-1 tvg-id="ch' + i + '.fr" tvg-name="Chaîne ' + i + '" tvg-logo="' + base + '/logo/' + i +
        '.png" tvg-chno="' + (i + 1) + '" group-title="' + g + '",Chaîne ' + i;
      if (i % 50 === 0) yield '#EXTVLCOPT:http-user-agent=Mozilla/5.0 Fixture';
      yield o.xtreamPaths ? base + '/live/u/p/' + i + '.ts' : base + '/stream/' + i + '.m3u8';
    } else if (r < 8) {
      yield '#EXTINF:-1 tvg-logo="' + base + '/poster/' + i + '.jpg" group-title="VOD | Films ' + (i % 5) + '",Film ' + i + ' (20' + (10 + (i % 15)) + ')';
      yield o.xtreamPaths ? base + '/movie/u/p/' + i + '.mkv' : base + '/vod/' + i + '.mp4';
    } else {
      const show = 'Série ' + (i % 40);
      const s = 1 + ((i >> 5) % 3);
      const e = 1 + (i % 24);
      yield '#EXTINF:-1 group-title="Séries ' + (i % 4) + '",' + show + ' S' + pad(s) + 'E' + pad(e);
      yield o.xtreamPaths ? base + '/series/u/p/' + i + '.mp4' : base + '/series-files/' + i + '.mkv';
    }
  }
}

export function generateM3u(o: FixtureOptions): string {
  const out: string[] = [];
  for (const l of generateM3uLines(o)) out.push(l);
  return out.join('\n') + '\n';
}

const pad = (n: number) => (n < 10 ? '0' + n : String(n));

/** Guide XMLTV factice : programmes de 30 min pour `channels` chaînes chXX.fr. */
export function generateXmltv(o: { channels: number; hours: number; start: number }): string {
  const fmt = (t: number) => {
    const d = new Date(t);
    const p2 = (n: number) => (n < 10 ? '0' + n : String(n));
    return (
      d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + '00 +0000'
    );
  };
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="oria-fixture">'];
  for (let c = 0; c < o.channels; c++) {
    out.push('<channel id="ch' + c + '.fr"><display-name>Chaîne ' + (c + 1) + '</display-name></channel>');
  }
  for (let c = 0; c < o.channels; c++) {
    for (let i = 0; i < o.hours * 2; i++) {
      const s = o.start + i * 1_800_000;
      out.push(
        '<programme start="' + fmt(s) + '" stop="' + fmt(s + 1_800_000) + '" channel="ch' + c + '.fr">' +
          '<title lang="fr">Programme ' + (i + 1) + ' &amp; co</title><desc lang="fr">Description du programme ' + (i + 1) + '.</desc></programme>',
      );
    }
  }
  out.push('</tv>');
  return out.join('\n');
}
