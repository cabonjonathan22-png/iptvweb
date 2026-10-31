/** Test d'intégration : lance le vrai serveur proxy face à une fausse origine. */
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proxiedUrl } from '../../packages/shared/src/stream-token.ts';

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
