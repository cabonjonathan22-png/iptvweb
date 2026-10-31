import { describe, expect, it } from 'vitest';
import { createM3uParser, parseM3u, type M3uEntry } from './m3u';
import { classifyM3u, parseEpisode } from './classify';
import { generateM3u } from './fixtures';

describe('parseM3u', () => {
  it('parses header, attributes, options', () => {
    const text = [
      '﻿#EXTM3U url-tvg="http://epg.test/a.xml,http://epg.test/b.xml"',
      '#EXTINF:-1 tvg-id="tf1.fr" tvg-name="TF1 HD" tvg-logo="http://l/tf1.png" group-title="France, Généraliste" tvg-chno=1 catchup="xc" catchup-days="7",TF1 HD',
      '#EXTVLCOPT:http-user-agent=Mozilla/5.0 Test',
      '#EXTVLCOPT:http-referrer=http://ref.test/',
      'http://s.test/live/1.ts',
      '',
      '#EXTINF:0,Sans attributs',
      '#EXTGRP:Groupe EXTGRP',
      'http://s.test/2.m3u8|User-Agent=Kodi%2F20&Referer=http://r.test',
      'http://s.test/nue/Ma%20Video.mp4',
    ].join('\r\n');
    const { header, entries } = parseM3u(text);
    expect(header.epgUrl).toBe('http://epg.test/a.xml');
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      name: 'TF1 HD',
      url: 'http://s.test/live/1.ts',
      tvgId: 'tf1.fr',
      tvgLogo: 'http://l/tf1.png',
      group: 'France, Généraliste',
      tvgChno: 1,
      catchup: 'xc',
      catchupDays: 7,
      userAgent: 'Mozilla/5.0 Test',
      referrer: 'http://ref.test/',
    });
    expect(entries[1]).toMatchObject({
      name: 'Sans attributs',
      group: 'Groupe EXTGRP',
      url: 'http://s.test/2.m3u8',
      userAgent: 'Kodi/20',
      referrer: 'http://r.test',
    });
    // Les options d'une entrée ne fuient pas sur la suivante.
    expect(entries[2]).toMatchObject({ name: 'Ma Video.mp4', url: 'http://s.test/nue/Ma%20Video.mp4' });
    expect(entries[2]!.userAgent).toBeUndefined();
  });

  it('handles a comma inside the title and unquoted attributes', () => {
    const { entries } = parseM3u('#EXTM3U\n#EXTINF:-1 group-title=News,CNN, International\nhttp://x/1');
    expect(entries[0]).toMatchObject({ name: 'CNN, International', group: 'News' });
  });

  it('streams 60 000 entries split at arbitrary chunk boundaries', () => {
    const text = generateM3u({ count: 60_000 });
    let n = 0;
    let last: M3uEntry | null = null;
    let withUa = 0;
    const p = createM3uParser({
      onEntry: (e) => {
        n++;
        last = e;
        if (e.userAgent) withUa++;
      },
    });
    // Morceaux de tailles irrégulières, comme un flux réseau.
    let i = 0;
    let size = 1;
    while (i < text.length) {
      p.push(text.slice(i, i + size));
      i += size;
      size = (size * 7 + 13) % 8191 || 1;
    }
    p.end();
    expect(n).toBe(60_000);
    expect(last!.url).toContain('/series-files/59999.mkv');
    expect(withUa).toBe(1200); // une entrée sur 50 (toujours live : 50 est multiple de 10)
  });
});

describe('classification', () => {
  it('uses Xtream paths first', () => {
    expect(classifyM3u({ url: 'http://p/live/u/p/1.ts', name: 'x' })).toBe('live');
    expect(classifyM3u({ url: 'http://p/movie/u/p/1.mkv', name: 'x' })).toBe('vod');
    expect(classifyM3u({ url: 'http://p/series/u/p/1.mp4', name: 'x' })).toBe('series');
  });

  it('falls back on extensions, episode patterns and groups', () => {
    expect(classifyM3u({ url: 'http://p/a.mp4', name: 'Inception (2010)' })).toBe('vod');
    expect(classifyM3u({ url: 'http://p/a.mkv', name: 'Dark S02E03' })).toBe('series');
    expect(classifyM3u({ url: 'http://p/a.m3u8', name: 'Films 24/7', group: 'Films' })).toBe('live');
    expect(classifyM3u({ url: 'http://p/12345', name: 'Inception', group: 'VOD Action' })).toBe('vod');
    expect(classifyM3u({ url: 'http://p/12345', name: 'TF1', group: 'France' })).toBe('live');
  });

  it('counts the generated mix', () => {
    const { entries } = parseM3u(generateM3u({ count: 1000 }));
    const c = { live: 0, vod: 0, series: 0 };
    entries.forEach((e) => c[classifyM3u(e)]++);
    expect(c).toEqual({ live: 600, vod: 200, series: 200 });
  });

  it('parses episode names', () => {
    expect(parseEpisode('Breaking Bad S01E02')).toEqual({ series: 'Breaking Bad', season: 1, episode: 2 });
    expect(parseEpisode('Breaking.Bad.S01.E02.720p')).toEqual({ series: 'Breaking Bad', season: 1, episode: 2 });
    expect(parseEpisode('The Office - 3x12')).toEqual({ series: 'The Office', season: 3, episode: 12 });
    expect(parseEpisode('Inception (2010)')).toBeNull();
  });
});
