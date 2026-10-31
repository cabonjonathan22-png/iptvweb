import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { location: { search: '' }, sessionStorage: { getItem: () => null, setItem: () => undefined } });
vi.stubGlobal('navigator', { userAgent: '', maxTouchPoints: 0 });

describe('detectDevice', () => {
  it('reconnaît TV, téléphone et PC', async () => {
    const { detectDevice } = await import('./device');
    const tv = [
      'Mozilla/5.0 (Linux; VIDAA/6.0; Hisense) AppleWebKit/537.36 Chrome/70 Safari/537.36',
      'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36',
      'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36',
      'Mozilla/5.0 (Linux; Android 9; BRAVIA 4K) AppleWebKit/537.36',
    ];
    for (const ua of tv) expect(detectDevice(ua)).toBe('tv');
    expect(detectDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('mobile');
    expect(detectDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe('mobile');
    expect(detectDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605', { touch: true })).toBe('mobile');
    expect(detectDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36')).toBe('desktop');
    expect(detectDevice('Mozilla/5.0 (Windows NT 10.0)', { forced: 'tv' })).toBe('tv');
  });
});
