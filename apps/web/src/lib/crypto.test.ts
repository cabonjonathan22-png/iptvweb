import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, randomToken, safeEqualHex, sha256 } from './crypto';

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('AES-GCM credentials', () => {
  const creds = { server: 'http://example.test:8080', username: 'u', password: 'p@ss' };

  it('round-trips', () => {
    expect(decryptJson(encryptJson(creds))).toEqual(creds);
  });

  it('uses a fresh IV each time', () => {
    expect(encryptJson(creds)).not.toBe(encryptJson(creds));
  });

  it('rejects tampered payloads', () => {
    const parts = encryptJson(creds).split('.');
    const ct = Buffer.from(parts[3]!, 'base64url');
    ct[0]! ^= 1;
    parts[3] = ct.toString('base64url');
    expect(() => decryptJson(parts.join('.'))).toThrow();
  });
});

describe('tokens', () => {
  it('prefixes and hashes', () => {
    const t = randomToken('dvc_');
    expect(t.startsWith('dvc_')).toBe(true);
    expect(safeEqualHex(sha256(t), sha256(t))).toBe(true);
    expect(safeEqualHex(sha256(t), sha256(t + 'x'))).toBe(false);
  });
});
