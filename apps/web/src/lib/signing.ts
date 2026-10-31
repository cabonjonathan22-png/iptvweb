import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC court pour signer des URL publiques (proxy d'images) : empêche d'en faire un proxy ouvert. */
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET manquant');
  return s;
}

export function sign(purpose: string, data: string): string {
  return createHmac('sha256', secret()).update(purpose + '\0' + data).digest('base64url').slice(0, 22);
}

export function verify(purpose: string, data: string, sig: string): boolean {
  const expected = Buffer.from(sign(purpose, data));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
