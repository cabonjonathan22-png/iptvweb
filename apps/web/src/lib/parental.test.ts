import { beforeAll, describe, expect, it } from 'vitest';
import { hashPin, isUnlocked, unlockToken, verifyPin } from './parental';
import { isCompleted } from './user-data';
import { cleanTitle } from './tmdb';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-for-signing';
});

const req = (token?: string) => new Request('http://x', { headers: token ? { 'X-Parental': token } : {} });

describe('parental PIN', () => {
  it('hashes with a random salt and verifies', () => {
    const a = hashPin('1234');
    expect(a).not.toBe(hashPin('1234'));
    expect(a).not.toContain('1234');
    expect(verifyPin('1234', a)).toBe(true);
    expect(verifyPin('1235', a)).toBe(false);
    expect(verifyPin('1234', null)).toBe(false);
  });

  it('issues unlock tokens bound to the user', () => {
    const t = unlockToken('user-1');
    expect(isUnlocked(req(t), 'user-1')).toBe(true);
    expect(isUnlocked(req(t), 'user-2')).toBe(false);
    expect(isUnlocked(req(), 'user-1')).toBe(false);
    const [b64, sig] = t.split('.');
    const forged = Buffer.from('user-1.' + (Date.now() + 9e9)).toString('base64url') + '.' + sig;
    expect(isUnlocked(req(forged), 'user-1')).toBe(false);
    expect(isUnlocked(req(b64 + '.AAAA'), 'user-1')).toBe(false);
  });
});

describe('watch progress', () => {
  it('marks long content as watched near the end, short content only past 92 %', () => {
    expect(isCompleted(5400 - 60, 5400)).toBe(true);
    expect(isCompleted(2000, 5400)).toBe(false);
    expect(isCompleted(7.6, 10)).toBe(false);
    expect(isCompleted(9.5, 10)).toBe(true);
    expect(isCompleted(100, null)).toBe(false);
  });
});

describe('tmdb title cleanup', () => {
  it('strips provider prefixes, years and quality tags', () => {
    expect(cleanTitle('FR - Inception (2010) [MULTI] 4K')).toBe('Inception');
    expect(cleanTitle('|FR| Le Dîner de cons HD')).toBe('Le Dîner de cons');
    expect(cleanTitle('Dune: Part Two')).toBe('Dune: Part Two');
  });
});
