/**
 * Service de pairing TV <-> compte.
 *
 * Flux :
 *  1. TV  -> start()   : code 6 caractères + secret, stockés 10 min dans le KV.
 *  2. User -> confirm() : (dashboard, connecté) crée le device en base, génère
 *                         le device token et le dépose dans l'entrée KV.
 *  3. TV  -> status()  : polling ; quand l'entrée est "linked", la TV récupère
 *                         le token une seule fois, puis l'entrée est supprimée.
 *
 * Le secret (connu de la seule TV) empêche quelqu'un qui lirait le code par-dessus
 * l'épaule de récupérer le token à la place de la TV.
 */
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import {
  PAIR_CODE_TTL_SECONDS,
  generatePairCode,
  isValidPairCode,
  normalizePairCode,
  type PairStartResponse,
  type PairStatusResponse,
  type TvDevice,
} from '@iptv/shared';
import { getDb, schema } from './db';
import { getKv } from './kv';
import { randomToken, safeEqualHex, sha256 } from './crypto';
import { appUrl } from './http';

type PairEntry =
  | { status: 'pending'; secretHash: string; expiresAt: number; userAgent: string | null }
  | { status: 'linked'; secretHash: string; token: string; device: TvDevice };

const keyOf = (code: string) => 'pair:' + code;

/** Délai laissé à la TV pour récupérer son token une fois liée. */
const LINKED_GRACE_SECONDS = 120;

export async function startPairing(userAgent: string | null): Promise<PairStartResponse> {
  const kv = getKv();
  const secret = randomToken('', 24);
  const expiresAt = Date.now() + PAIR_CODE_TTL_SECONDS * 1000;
  const entry: PairEntry = { status: 'pending', secretHash: sha256(secret), expiresAt, userAgent };

  // Collisions improbables (32^6 ≈ 1 milliard) mais gérées via SET NX.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePairCode((n) => new Uint8Array(randomBytes(n)));
    if (await kv.set(keyOf(code), entry, { ex: PAIR_CODE_TTL_SECONDS, nx: true })) {
      const linkUrl = appUrl() + '/link?code=' + code;
      const qrSvg = await QRCode.toString(linkUrl, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0B0B10', light: '#FFFFFF' },
      });
      return { code, secret, expiresAt, linkUrl, qrSvg };
    }
  }
  throw new Error('Impossible de générer un code unique');
}

export async function pairingStatus(rawCode: string, secret: string): Promise<PairStatusResponse | null> {
  const code = normalizePairCode(rawCode);
  if (!isValidPairCode(code) || !secret) return null;
  const kv = getKv();
  const entry = await kv.get<PairEntry>(keyOf(code));
  // Secret invalide = même réponse qu'un code inconnu : pas d'oracle d'existence des codes.
  if (!entry || !safeEqualHex(entry.secretHash, sha256(secret))) return { status: 'expired' };

  if (entry.status === 'pending') return { status: 'pending', expiresAt: entry.expiresAt };

  // Livraison unique du token.
  await kv.del(keyOf(code));
  return { status: 'linked', token: entry.token, device: entry.device };
}

export type ConfirmResult =
  | { ok: true; device: TvDevice }
  | { ok: false; reason: 'invalid_code' | 'expired_or_unknown' | 'already_linked' };

export async function confirmPairing(userId: string, rawCode: string, name: string): Promise<ConfirmResult> {
  const code = normalizePairCode(rawCode);
  if (!isValidPairCode(code)) return { ok: false, reason: 'invalid_code' };

  const kv = getKv();
  const entry = await kv.get<PairEntry>(keyOf(code));
  if (!entry) return { ok: false, reason: 'expired_or_unknown' };
  if (entry.status !== 'pending') return { ok: false, reason: 'already_linked' };
  // Verrou : deux confirmations simultanées du même code ne créent qu'un appareil.
  if (!(await kv.set('pairlock:' + code, 1, { ex: 30, nx: true }))) {
    return { ok: false, reason: 'already_linked' };
  }

  const db = await getDb();
  const token = randomToken('dvc_');

  // Assigne d'office la première playlist de l'utilisateur, s'il en a une.
  const firstPlaylist = await db.query.playlists.findFirst({
    columns: { id: true },
    where: (p, { eq }) => eq(p.userId, userId),
    orderBy: (p, { asc }) => asc(p.createdAt),
  });

  const [row] = await db
    .insert(schema.devices)
    .values({
      userId,
      name: name.trim().slice(0, 60) || 'Ma TV',
      tokenHash: sha256(token),
      userAgent: entry.userAgent?.slice(0, 300) ?? null,
      playlistId: firstPlaylist?.id ?? null,
      lastSeenAt: new Date(),
    })
    .returning({ id: schema.devices.id, name: schema.devices.name, playlistId: schema.devices.playlistId });

  const device: TvDevice = { id: row!.id, name: row!.name, playlistId: row!.playlistId };
  const linked: PairEntry = { status: 'linked', secretHash: entry.secretHash, token, device };
  await kv.set(keyOf(code), linked, { ex: LINKED_GRACE_SECONDS });
  return { ok: true, device };
}
