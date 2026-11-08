import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxiedUrl } from '../../../packages/shared/src/stream-token.ts';
import worker, { openStream } from './index.ts';

const SECRET = 'test-secret-0123456789';
const env = { STREAM_PROXY_SECRET: SECRET };
const BASE = 'https://relay.example.workers.dev';
const exp = () => Math.floor(Date.now() / 1000) + 60;
const tok = (u: string, extra: { ua?: string; exp?: number } = {}) => proxiedUrl(BASE, { u, exp: exp(), ...extra }, SECRET);
const call = (url: string, init?: RequestInit) => worker.fetch(new Request(url, init), env);

afterEach(() => vi.unstubAllGlobals());

function origin(routes: Record<string, () => Response>) {
  const seen: { url: string; ua: string | null; range: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const h = new Headers(init.headers);
      seen.push({ url: input, ua: h.get('user-agent'), range: h.get('range') });
      const r = routes[input];
      return r ? r() : new Response('missing', { status: 404 });
    }),
  );
  return seen;
}

describe('relais Cloudflare', () => {
  it('ouvre les jetons émis par l’API (Node) et refuse les autres', async () => {
    const token = /\/s\/([^/]+)\//.exec(tok('http://panel.tv/a.ts'))![1]!;
    expect((await openStream(token, SECRET))!.u).toBe('http://panel.tv/a.ts');
    expect(await openStream(token, 'another-secret-xxxxxx')).toBeNull();
    expect((await call(BASE + '/s/abc/x')).status).toBe(403);
    expect((await call(tok('http://panel.tv/a.ts', { exp: 1 }))).status).toBe(403);
    expect((await call(tok('http://127.0.0.1/a.ts'))).status).toBe(403);
  });

  it('réécrit une playlist HLS vers lui-même, clés comprises', async () => {
    origin({
      'http://panel.tv:8080/live/1.m3u8': () =>
        new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k.key"\n#EXTINF:4,\nseg1.ts\n', { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }),
      'http://panel.tv:8080/live/seg1.ts': () => new Response('SEG', { headers: { 'Content-Type': 'video/mp2t' } }),
    });
    const res = await call(tok('http://panel.tv:8080/live/1.m3u8'));
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = await res.text();
    expect(body).not.toContain('panel.tv');
    expect(body).toMatch(/URI="https:\/\/relay\.example\.workers\.dev\/s\/[^"]+\/k\.key"/);
    const seg = body.split('\n').find((l) => l.endsWith('/seg1.ts'))!;
    expect(await (await call(seg)).text()).toBe('SEG');
  });

  it('relaie les plages (avance rapide) et le User-Agent de la playlist', async () => {
    const seen = origin({
      'http://panel.tv/movie.mp4': () =>
        new Response('abc', { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-2/100', 'Accept-Ranges': 'bytes' } }),
    });
    const res = await call(tok('http://panel.tv/movie.mp4', { ua: 'MonLecteur/1' }), { headers: { Range: 'bytes=0-2' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-2/100');
    expect(seen[0]).toMatchObject({ ua: 'MonLecteur/1', range: 'bytes=0-2' });
  });

  it('réessaie un refus passager, suit une redirection, refuse une redirection privée', async () => {
    let n = 0;
    origin({
      'http://panel.tv/flaky.ts': () => (++n < 3 ? new Response('', { status: 503 }) : new Response('OK', { headers: { 'Content-Type': 'video/mp2t' } })),
      'http://panel.tv/moved.ts': () => new Response(null, { status: 302, headers: { Location: 'http://cdn.tv/real.ts' } }),
      'http://cdn.tv/real.ts': () => new Response('REAL', { headers: { 'Content-Type': 'video/mp2t' } }),
      'http://panel.tv/evil.ts': () => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest' } }),
    });
    expect(await (await call(tok('http://panel.tv/flaky.ts'))).text()).toBe('OK');
    expect(await (await call(tok('http://panel.tv/moved.ts'))).text()).toBe('REAL');
    expect((await call(tok('http://panel.tv/evil.ts'))).status).toBe(403);
  });
});
