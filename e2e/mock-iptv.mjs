/**
 * Faux serveur IPTV pour le dev et les tests (aucun contenu réel).
 *   node e2e/mock-iptv.mjs            (port 4010, ou MOCK_PORT)
 *
 *   GET /playlist.m3u?n=50000         M3U générée en flux
 *   GET /player_api.php?username=demo&password=demo[&action=…]
 *       actions : get_live_categories, get_live_streams, get_vod_categories,
 *                 get_vod_streams, get_series_categories, get_series
 *       taille : MOCK_XTREAM_N (défaut 3000 éléments par section)
 *
 * Nécessite ALLOW_PRIVATE_SOURCES=1 côté apps/web (adresse locale).
 */
import http from 'node:http';
import { generateM3uLines } from '../packages/shared/src/fixtures.ts';

const PORT = Number(process.env.MOCK_PORT || 4010);
const N = Number(process.env.MOCK_XTREAM_N || 3000);
const base = `http://localhost:${PORT}`;

/** Écrit un tableau JSON élément par élément (gros volumes sans mémoire). */
function streamArray(res, n, make) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write('[');
  for (let i = 0; i < n; i++) res.write((i ? ',' : '') + JSON.stringify(make(i)));
  res.end(']');
}

const cats = (prefix, n) =>
  Array.from({ length: n }, (_, i) => ({ category_id: String(i + 1), category_name: `${prefix} ${i + 1}`, parent_id: 0 }));

const actions = {
  get_live_categories: (res) => sendJson(res, cats('Live', 12)),
  get_live_streams: (res) =>
    streamArray(res, N, (i) => ({
      num: i + 1,
      name: `Chaîne ${i + 1}`,
      stream_type: 'live',
      stream_id: 1000 + i,
      stream_icon: `${base}/logo/${i}.png`,
      epg_channel_id: `ch${i}.fr`,
      added: '1700000000',
      category_id: String((i % 12) + 1),
      tv_archive: i % 10 === 0 ? 1 : 0,
      tv_archive_duration: i % 10 === 0 ? '7' : 0,
    })),
  get_vod_categories: (res) => sendJson(res, cats('Films', 8)),
  get_vod_streams: (res) =>
    streamArray(res, N, (i) => ({
      num: i + 1,
      name: `Film ${i + 1} (20${10 + (i % 15)})`,
      stream_id: 50000 + i,
      stream_icon: `${base}/poster/${i}.jpg`,
      rating: String((i % 10) / 2 + 5),
      added: String(1700000000 + i * 60),
      category_id: String((i % 8) + 1),
      container_extension: i % 3 ? 'mp4' : 'mkv',
    })),
  get_series_categories: (res) => sendJson(res, cats('Séries', 5)),
  get_series: (res) =>
    streamArray(res, Math.ceil(N / 10), (i) => ({
      num: i + 1,
      name: `Série ${i + 1}`,
      series_id: 9000 + i,
      cover: `${base}/cover/${i}.jpg`,
      plot: 'Synopsis factice.',
      cast: 'Acteur A, Actrice B',
      genre: 'Drame',
      releaseDate: '2021-03-01',
      last_modified: '1700000000',
      rating: '7.5',
      backdrop_path: [`${base}/backdrop/${i}.jpg`],
      category_id: String((i % 5) + 1),
    })),
};

function sendJson(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, base);
  if (url.pathname === '/playlist.m3u') {
    const n = Number(url.searchParams.get('n') || 1000);
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' });
    for (const line of generateM3uLines({ count: n, baseUrl: base })) res.write(line + '\n');
    return res.end();
  }
  if (url.pathname === '/player_api.php') {
    const ok = url.searchParams.get('username') === 'demo' && url.searchParams.get('password') === 'demo';
    if (!ok) return sendJson(res, { user_info: { auth: 0 } });
    const action = url.searchParams.get('action');
    if (!action) {
      return sendJson(res, {
        user_info: {
          auth: 1,
          status: 'Active',
          exp_date: String(Math.floor(Date.now() / 1000) + 30 * 86400),
          max_connections: '2',
        },
        server_info: { url: 'localhost', port: String(PORT) },
      });
    }
    const h = actions[action];
    return h ? h(res) : sendJson(res, []);
  }
  if (url.pathname === '/html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><html><body>Login</body></html>');
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => console.log(`[mock-iptv] ${base}`));
