import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  formatPairCode,
  generatePairCode,
  isValidPairCode,
  normalizePairCode,
} from './pairing';

describe('pairing codes', () => {
  it('excludes ambiguous characters', () => {
    for (const c of ['0', 'O', '1', 'I']) expect(PAIR_CODE_ALPHABET).not.toContain(c);
  });

  it('generates valid codes', () => {
    for (let i = 0; i < 2000; i++) {
      const code = generatePairCode((n) => new Uint8Array(randomBytes(n)));
      expect(code).toHaveLength(PAIR_CODE_LENGTH);
      expect(isValidPairCode(code)).toBe(true);
    }
  });

  it('normalizes and validates user input', () => {
    expect(normalizePairCode(' abc-def ')).toBe('ABCDEF');
    expect(isValidPairCode('ABCDEF')).toBe(true);
    expect(isValidPairCode('ABCDE0')).toBe(false);
    expect(isValidPairCode('ABCDEI')).toBe(false);
    expect(isValidPairCode('ABCDE')).toBe(false);
  });

  it('formats for display', () => {
    expect(formatPairCode('ABCDEF')).toBe('ABC DEF');
  });
});
