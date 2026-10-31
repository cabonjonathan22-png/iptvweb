import { describe, expect, it } from 'vitest';
import { m3uCatchupUrl, xtreamCatchupUrl, xtreamStamp } from './catchup';

// 31 octobre 2026, 18:30 UTC ; 45 minutes.
const start = Date.UTC(2026, 9, 31, 18, 30);
const w = { start, stop: start + 45 * 60_000 };
const now = start + 3600_000;
const s = start / 1000;

describe('replay Xtream', () => {
  it('utilise le fuseau du serveur du fournisseur', () => {
    expect(xtreamStamp(start, 'UTC')).toBe('2026-10-31:18-30');
    expect(xtreamStamp(start, 'Europe/Paris')).toBe('2026-10-31:19-30');
  });
  it('se replie sur UTC si le fuseau est inconnu ou absent', () => {
    expect(xtreamStamp(start, 'Pas/Un_Fuseau')).toBe('2026-10-31:18-30');
    expect(xtreamStamp(start, null)).toBe('2026-10-31:18-30');
  });
  it('construit le chemin timeshift, identifiants encodés', () => {
    const url = xtreamCatchupUrl({ server: 'http://p.tv:8080', username: 'a b', password: 'c' }, 12, w, 'ts', 'UTC');
    expect(url).toBe('http://p.tv:8080/timeshift/a%20b/c/45/2026-10-31:18-30/12.ts');
  });
});

describe('replay M3U', () => {
  it('default : remplit la source', () => {
    expect(m3uCatchupUrl('http://x/l.m3u8', 'default', 'http://x/c?s={utc}&d={duration}&n=${now}', w, now)).toBe(`http://x/c?s=${s}&d=2700&n=${s + 3600}`);
  });
  it('dates formatées et durée en minutes', () => {
    expect(m3uCatchupUrl('http://x/l', 'default', 'http://x/{utc:YmdHMS}/{Y}-{m}-{d}/{duration:60}', w, now)).toBe('http://x/20261031183000/2026-10-31/45');
  });
  it('append : ajoute à l’URL du flux', () => {
    expect(m3uCatchupUrl('http://x/l.m3u8', 'append', '?t=${start}', w, now)).toBe(`http://x/l.m3u8?t=${s}`);
  });
  it('shift : ajoute utc et lutc', () => {
    expect(m3uCatchupUrl('http://x/l.m3u8?a=1', 'shift', null, w, now)).toBe(`http://x/l.m3u8?a=1&utc=${s}&lutc=${s + 3600}`);
  });
  it('xc : déduit le chemin depuis l’URL du direct', () => {
    expect(m3uCatchupUrl('http://p.tv/live/u/p/77.ts', 'xc', null, w, now)).toBe('http://p.tv/timeshift/u/p/45/2026-10-31:18-30/77.ts');
  });
  it('flussonic', () => {
    expect(m3uCatchupUrl('http://f/ch/index.m3u8?token=1', 'flussonic', null, w, now)).toBe(`http://f/ch/index-${s}-2700.m3u8?token=1`);
    expect(m3uCatchupUrl('http://f/ch/mpegts', 'fs', null, w, now)).toBe(`http://f/ch/timeshift_abs-${s}.ts`);
  });
  it('sans source exploitable : null', () => {
    expect(m3uCatchupUrl('http://x/l', 'default', null, w, now)).toBeNull();
    expect(m3uCatchupUrl('http://x/l', null, null, w, now)).toBeNull();
  });
});
