import { describe, expect, it } from 'vitest';
import { createJsonArrayStream } from './json-stream';
import { normalizeServer, xtreamApiUrl, xtreamFromM3uUrl, xtreamLiveUrl, xtreamVodUrl, num, yearOf } from './xtream';

describe('json array stream', () => {
  const feed = (text: string, step: number) => {
    const items: unknown[] = [];
    const s = createJsonArrayStream((v) => items.push(v));
    for (let i = 0; i < text.length; i += step) s.push(text.slice(i, i + step));
    return { items, root: s.end() };
  };

  it('emits each object, whatever the chunking', () => {
    const data = Array.from({ length: 50_000 }, (_, i) => ({
      stream_id: i,
      name: 'Chaîne "' + i + '" {x} [y] \\',
      nested: { a: [1, { b: '}' }] },
    }));
    const text = JSON.stringify(data);
    for (const step of [1, 7, 4096]) {
      const { items, root } = feed(step === 1 ? JSON.stringify(data.slice(0, 300)) : text, step);
      expect(root).toBeUndefined();
      expect(items).toEqual(step === 1 ? data.slice(0, 300) : data);
    }
  });

  it('returns non-array roots (Xtream errors)', () => {
    const { items, root } = feed('  {"user_info":{"auth":0}}', 5);
    expect(items).toHaveLength(0);
    expect(root).toEqual({ user_info: { auth: 0 } });
  });

  it('handles empty arrays', () => {
    expect(feed('[]', 1).items).toHaveLength(0);
  });
});

describe('xtream urls', () => {
  const c = { server: normalizeServer('panel.test:8080/player_api.php?x=1'), username: 'u s', password: 'p&w' };

  it('normalizes the server', () => {
    expect(c.server).toBe('http://panel.test:8080');
    expect(normalizeServer('https://a.test/')).toBe('https://a.test');
  });

  it('builds encoded urls', () => {
    expect(xtreamApiUrl(c, 'get_live_streams', { category_id: 3 })).toBe(
      'http://panel.test:8080/player_api.php?username=u%20s&password=p%26w&action=get_live_streams&category_id=3',
    );
    expect(xtreamLiveUrl(c, 12)).toBe('http://panel.test:8080/live/u%20s/p%26w/12.m3u8');
    expect(xtreamVodUrl(c, 5, 'mkv')).toBe('http://panel.test:8080/movie/u%20s/p%26w/5.mkv');
  });

  it('detects Xtream m3u urls', () => {
    expect(xtreamFromM3uUrl('http://a.test:80/get.php?username=x&password=y&type=m3u_plus')).toEqual({
      server: 'http://a.test:80',
      username: 'x',
      password: 'y',
    });
    expect(xtreamFromM3uUrl('http://a.test/list.m3u')).toBeNull();
  });

  it('normalizes loose values', () => {
    expect(num('12')).toBe(12);
    expect(num('')).toBeNull();
    expect(yearOf('2019-05-01')).toBe(2019);
  });
});
