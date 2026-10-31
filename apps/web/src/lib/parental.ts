/**
 * Contrôle parental.
 * - PIN à 4 chiffres haché (scrypt + sel) dans user_settings.
 * - Une catégorie « verrouillée » n'est accessible qu'avec un jeton de
 *   déverrouillage (en-tête X-Parental), délivré 1 h après saisie du bon PIN.
 * - Sans PIN défini, le verrouillage n'est pas appliqué (le dashboard invite à en créer un).
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { sign, verify } from './signing';

const UNLOCK_TTL_MS = 3600_000;

export const PIN_RE = /^\d{4}$/;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return 'scrypt$' + salt.toString('base64url') + '$' + hash.toString('base64url');
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const got = scryptSync(pin, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(expected, got);
}

export function unlockToken(userId: string): string {
  const payload = userId + '.' + (Date.now() + UNLOCK_TTL_MS);
  return Buffer.from(payload).toString('base64url') + '.' + sign('parental', payload);
}

export function isUnlocked(req: Request, userId: string): boolean {
  const raw = req.headers.get('x-parental');
  if (!raw) return false;
  const [b64, sig] = raw.split('.');
  if (!b64 || !sig) return false;
  const payload = Buffer.from(b64, 'base64url').toString('utf8');
  const [uid, exp] = payload.split('.');
  return uid === userId && Number(exp) > Date.now() && verify('parental', payload, sig);
}
