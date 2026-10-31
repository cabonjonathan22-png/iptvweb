/** Test d'intégration : lance le vrai serveur proxy face à une fausse origine. */
import fs from 'node:fs';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proxiedUrl, sealStream } from '../../packages/shared/src/stream-token.ts';

const SECRET = 'test-secret-0123456789';
const PORT = 18_080;
const PROXY = `http://127.0.0.1:${PORT}`;
let origin: http.Server;
let originUrl = '';
let proc: ChildProcess;
const seen: { ua?: string; ref?: string; range?: string }[] = [];

beforeAll(async () => {
  const media = Buffer.alloc(1000, 7);
  origin = http.createServer((req, res) => {
    seen.push({ ua: req.headers['user-agent'], ref: req.headers.referer, range: req.headers.range });
    if (req.url === '/redirect.m3u8') {
      res.writeHead(302, { Location: '/hls/index.m3u8' });
      return res.end();
    }
    if (req.url === '/hls/index.m3u8') {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      return res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k.key"\n#EXTINF:4,\nseg1.ts\n');
    }
    if (req.url === '/hls/seg1.ts' || req.url === '/movie.mp4') {
      const m = /bytes=(\d+)-(\d+)?/.exec(req.headers.range || '');
      if (m) {
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : media.length - 1;
        res.writeHead(206, {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${a}-${b}/${media.length}`,
          'Content-Length': String(b - a + 1),
          'Accept-Ranges': 'bytes',
        });
        return res.end(media.subarray(a, b + 1));
      }
      res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': String(media.length) });
      return res.end(media);
    }
    if (req.url === '/film.mkv' && process.env.REMUX_TEST_FILE) {
      const file = fs.readFileSync(process.env.REMUX_TEST_FILE);
      const m = /bytes=(\d+)-(\d+)?/.exec(req.headers.range || '');
      const a = m ? Number(m[1]) : 0;
      const b = m && m[2] ? Number(m[2]) : file.length - 1;
      res.writeHead(m ? 206 : 200, {
        'Content-Type': 'video/x-matroska',
        'Content-Length': String(b - a + 1),
        'Accept-Ranges': 'bytes',
        ...(m ? { 'Content-Range': `bytes ${a}-${b}/${file.length}` } : {}),
      });
      return res.end(file.subarray(a, b + 1));
    }
    if (req.url === '/to-metadata') {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest' });
      return res.end();
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => origin.listen(0, '127.0.0.1', r));
  originUrl = 'http://127.0.0.1:' + (origin.address() as { port: number }).port;

  proc = spawn(process.execPath, [fileURLToPath(new URL('./server.ts', import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), STREAM_PROXY_SECRET: SECRET, PUBLIC_URL: PROXY, ALLOW_PRIVATE_UPSTREAMS: '1' },
    stdio: 'pipe',
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('proxy did not start')), 10_000);
    proc.stdout!.on('data', (d) => {
      if (String(d).includes('stream-proxy')) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}, 20_000);

afterAll(() => {
  proc?.kill();
  origin?.close();
});

const tok = (path: string, extra: { ua?: string; ref?: string; exp?: number } = {}) =>
  proxiedUrl(PROXY, { u: originUrl + path, exp: Math.floor(Date.now() / 1000) + 60, ...extra }, SECRET);

describe('stream proxy', () => {
  it('rewrites HLS playlists (after redirects) and forwards UA / Referer', async () => {
    const res = await fetch(tok('/redirect.m3u8', { ua: 'MyUA', ref: 'http://ref.test/' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('content-type')).toContain('mpegurl');
    const body = await res.text();
    expect(body).not.toContain(originUrl);
    const lines = body.split('\n');
    const seg = lines.find((l) => l.startsWith(PROXY) && l.endsWith('/seg1.ts'))!;
    expect(seg).toBeTruthy();
    expect(body).toMatch(new RegExp('URI="' + PROXY.replace(/[.:/]/g, '\\$&') + '/s/[^"]+/k\\.key"'));

    // Le segment réécrit passe par le proxy, avec les mêmes en-têtes vers l'origine.
    const segRes = await fetch(seg);
    expect(segRes.status).toBe(200);
    expect((await segRes.arrayBuffer()).byteLength).toBe(1000);
    expect(seen[seen.length - 1]).toMatchObject({ ua: 'MyUA', ref: 'http://ref.test/' });
  });

  it('relays Range requests', async () => {
    const res = await fetch(tok('/movie.mp4'), { headers: { Range: 'bytes=100-199' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it('rejects invalid, expired and foreign tokens', async () => {
    expect((await fetch(PROXY + '/s/abc/x.ts')).status).toBe(403);
    expect((await fetch(tok('/movie.mp4', { exp: 1 }))).status).toBe(403);
    const foreign = proxiedUrl(PROXY, { u: originUrl + '/movie.mp4', exp: 2e9 }, 'another-secret-xxxxxx');
    expect((await fetch(foreign)).status).toBe(403);
  });

  it('answers health checks and CORS preflights', async () => {
    expect(await (await fetch(PROXY + '/health')).text()).toBe('ok');
    const pre = await fetch(PROXY + '/s/x/y', { method: 'OPTIONS' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('Range');
  });
});

// Demande ffmpeg et un MKV de test : FFMPEG_PATH, FFPROBE_PATH et REMUX_TEST_FILE (deux pistes audio AC3).
describe.skipIf(!process.env.REMUX_TEST_FILE)('conversion MKV', () => {
  const base = () => `${PROXY}/x/${sealStream({ u: originUrl + '/film.mkv', exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;

  it('annonce la durée et les pistes, en HLS lisible, avec CORS', async () => {
    const b = base();
    const info = (await (await fetch(b + '/info')).json()) as { duration: number; video: string; audio: { lang: string }[] };
    expect(info.video).toBe('h264');
    expect(info.duration).toBeGreaterThan(30);
    expect(info.audio.map((a) => a.lang)).toEqual(['fre', 'eng']);

    const res = await fetch(b + '/0/0/index.m3u8');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const text = await res.text();
    expect(text).toContain('#EXT-X-START:TIME-OFFSET=0');
    expect(text).not.toContain(originUrl);
    const seg = /^seg\d+\.ts$/m.exec(text)![0];
    const media = await fetch(b + '/0/0/' + seg);
    expect(media.status).toBe(200);
    // Paquets MPEG-TS : octet de synchronisation.
    expect(new Uint8Array(await media.arrayBuffer())[0]).toBe(0x47);
  }, 90_000);

  it("repart d'une autre position et d'une autre piste audio", async () => {
    const b = base();
    const res = await fetch(b + '/20/1/index.m3u8');
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/seg0\.ts/);
  }, 90_000);

  it('refuse un jeton invalide ou un chemin de fichier', async () => {
    expect((await fetch(`${PROXY}/x/abc/info`)).status).toBe(403);
    expect((await fetch(`${base()}/0/0/..%2f..%2fserver.ts`)).status).toBe(403);
  });
});
