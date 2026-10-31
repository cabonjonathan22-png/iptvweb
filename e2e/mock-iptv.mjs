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
import { generateM3uLines, generateXmltv } from '../packages/shared/src/fixtures.ts';

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
  // Compte « langs » : des catégories nommées, pour tester le filtre de langues.
  get_live_categories: (res, url) =>
    sendJson(
      res,
      url.searchParams.get('username') === 'langs'
        ? ['FR | Sport', 'EN | News', 'Documentaires'].map((name, i) => ({ category_id: String(i + 1), category_name: name, parent_id: 0 }))
        : cats('Live', 12),
    ),
  get_live_streams: (res, url) =>
    streamArray(res, N, (i) => ({
      num: i + 1,
      name: `Chaîne ${i + 1}`,
      stream_type: 'live',
      stream_id: 1000 + i,
      stream_icon: `${base}/logo/${i}.png`,
      epg_channel_id: `ch${i}.fr`,
      added: '1700000000',
      category_id: String((i % (url.searchParams.get('username') === 'langs' ? 3 : 12)) + 1),
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
  get_vod_info: (res, url) => {
    const id = Number(url.searchParams.get('vod_id')) - 50000;
    sendJson(res, {
      info: {
        name: `Film ${id + 1}`,
        plot: `Synopsis détaillé du film ${id + 1}. Une histoire factice pour tester la fiche.`,
        cast: 'Acteur A, Actrice B, Acteur C',
        director: 'Réalisatrice D',
        genre: 'Aventure, Drame',
        releasedate: `20${10 + (id % 15)}-06-01`,
        duration_secs: 5400 + (id % 30) * 60,
        rating: '7.4',
        backdrop_path: [`${base}/backdrop/v${id}.jpg`],
      },
      movie_data: { stream_id: 50000 + id, container_extension: id % 3 ? 'mp4' : 'mkv' },
    });
  },
  get_series_info: (res, url) => {
    const sid = Number(url.searchParams.get('series_id'));
    const episodes = {};
    for (let season = 1; season <= 2; season++) {
      episodes[season] = Array.from({ length: 8 }, (_, i) => ({
        id: String(sid * 100 + season * 10 + i + 1),
        episode_num: i + 1,
        title: `Épisode ${i + 1}`,
        container_extension: 'mp4',
        season,
        info: { plot: `Résumé de l'épisode ${i + 1}.`, duration_secs: 2700, movie_image: `${base}/thumb/${sid}-${season}-${i}.jpg` },
      }));
    }
    sendJson(res, {
      seasons: [{ season_number: 1 }, { season_number: 2 }],
      info: { name: `Série ${sid - 8999}`, plot: 'Synopsis de la série.', cast: 'Distribution factice', genre: 'Drame', rating: '8.1' },
      episodes,
    });
  },
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

/** Vidéo MP4 de test publique (10 s), pour la VOD et les épisodes. */
const TEST_MP4 = process.env.MOCK_TEST_MP4 || 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4';

/** Flux HLS de test public (Mux), utilisé pour vérifier la lecture réelle. */
const TEST_HLS = process.env.MOCK_TEST_HLS || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

/**
 * Flux factices : une chaîne sur trois redirige vers le flux de test, une sur
 * trois est « hors ligne » (404, pour tester l'écran d'erreur), le reste aussi
 * vers le flux de test.
 */
function stream(res, id) {
  if (id % 3 === 1) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(302, { Location: TEST_HLS });
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, base);
  const live = /^\/(?:live\/[^/]+\/[^/]+|stream)\/(\d+)\.(m3u8|ts)$/.exec(url.pathname);
  if (live) return stream(res, Number(live[1]));
  if (url.pathname === '/playlist.m3u') {
    const n = Number(url.searchParams.get('n') || 1000);
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' });
    for (const line of generateM3uLines({ count: n, baseUrl: base })) res.write(line + '\n');
    return res.end();
  }
  if (url.pathname === '/player_api.php') {
    const user = url.searchParams.get('username');
    const ok = (user === 'demo' || user === 'langs') && url.searchParams.get('password') === 'demo';
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
    return h ? h(res, url) : sendJson(res, []);
  }
  // VOD / épisodes : redirection vers une vidéo de test.
  if (/^\/(movie|series)\/[^/]+\/[^/]+\/\d+\.\w+$/.test(url.pathname)) {
    res.writeHead(302, { Location: TEST_MP4 });
    return res.end();
  }
  // Guide TV : 100 premières chaînes, de -2 h à +24 h.
  if (url.pathname === '/xmltv.php' || url.pathname === '/epg.xml') {
    const start = Math.floor(Date.now() / 1_800_000) * 1_800_000 - 2 * 3600_000;
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    return res.end(generateXmltv({ channels: 100, hours: 26, start }));
  }
  if (url.pathname === '/html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><html><body>Login</body></html>');
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => console.log(`[mock-iptv] ${base}`));
