import { describe, expect, it } from 'vitest';
import { openStream, proxiedUrl, rewriteHlsPlaylist, sealStream, streamFileName } from './stream-token';
import { isPrivateIp } from './net-guard';

describe('stream tokens', () => {
  const t = { u: 'http://panel.test:8080/live/user/secret-pass/1.m3u8', ua: 'VLC', exp: 2e9 };

  it('round-trips and hides the upstream url', () => {
    const tok = sealStream(t, 's3cret');
    expect(tok).not.toContain('secret-pass');
    expect(Buffer.from(tok, 'base64url').toString('latin1')).not.toContain('secret-pass');
    expect(openStream(tok, 's3cret')).toEqual(t);
  });

  it('rejects wrong secret, tampering and expiry', () => {
    const tok = sealStream(t, 'a');
    expect(openStream(tok, 'b')).toBeNull();
    const bytes = Buffer.from(tok, 'base64url');
    bytes[bytes.length - 1]! ^= 1;
    expect(openStream(bytes.toString('base64url'), 'a')).toBeNull();
    expect(openStream(sealStream({ ...t, exp: 10 }, 'a'), 'a')).toBeNull();
    expect(openStream('garbage', 'a')).toBeNull();
  });

  it('builds proxy urls with a readable file name', () => {
    expect(streamFileName('http://x/live/u/p/12.m3u8?token=1')).toBe('12.m3u8');
    expect(proxiedUrl('https://stream.test/', t, 'k')).toMatch(/^https:\/\/stream\.test\/s\/[A-Za-z0-9_-]+\/1\.m3u8$/);
  });
});

describe('hls rewrite', () => {
  it('rewrites media lines and URI attributes against the final url', () => {
    const src = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x1',
      '#EXT-X-MAP:URI="/init.mp4"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio/fr.m3u8"',
      '#EXTINF:6.0,',
      'seg-1.ts',
      '',
      '#EXTINF:6.0,',
      'https://cdn.test/abs/seg-2.ts?x=1',
    ].join('\n');
    const out = rewriteHlsPlaylist(src, 'http://origin.test/hls/live/index.m3u8', (u) => 'P(' + u + ')');
    expect(out).toContain('URI="P(http://origin.test/hls/live/key.bin)"');
    expect(out).toContain('URI="P(http://origin.test/init.mp4)"');
    expect(out).toContain('URI="P(http://origin.test/hls/live/audio/fr.m3u8)"');
    expect(out).toContain('\nP(http://origin.test/hls/live/seg-1.ts)\n');
    expect(out).toContain('\nP(https://cdn.test/abs/seg-2.ts?x=1)');
    expect(out.startsWith('#EXTM3U\n')).toBe(true);
  });
});

describe('net guard', () => {
  it('flags private and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', '::ffff:10.0.0.1', 'fd00::1']) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1']) expect(isPrivateIp(ip)).toBe(false);
  });
});
