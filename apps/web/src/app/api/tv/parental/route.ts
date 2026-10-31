import { z } from 'zod';
import { apiError, json } from '@/lib/http';
import { hashPin, PIN_RE, unlockToken, verifyPin } from '@/lib/parental';
import { limiter } from '@/lib/ratelimit';
import { getSettings, saveSettings } from '@/lib/settings';
import { deviceOnly } from '@/lib/tv-api';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify'), pin: z.string() }),
  z.object({ action: z.literal('set'), pin: z.string().regex(PIN_RE).nullable(), currentPin: z.string().optional() }),
]);

/**
 * verify : bon PIN -> jeton de déverrouillage (1 h) à renvoyer en X-Parental.
 * set    : définit / change / supprime le PIN (le PIN actuel est exigé s'il existe).
 * 5 essais / 10 min par appareil (un PIN à 4 chiffres se devine vite sinon).
 */
export async function POST(req: Request) {
  const device = await deviceOnly(req);
  if (device instanceof Response) return device;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request', 'Le code doit comporter 4 chiffres.');

  const rl = await limiter('parental', 5, '10 m').limit(device.id);
  if (!rl.success) return apiError(429, 'rate_limited', 'Trop d’essais. Réessayez dans quelques minutes.');

  const settings = await getSettings(device.userId);
  const data = parsed.data;
  if (data.action === 'verify') {
    if (!settings?.parentalPinHash) return json({ token: unlockToken(device.userId) });
    if (!verifyPin(data.pin, settings.parentalPinHash)) return apiError(403, 'bad_pin', 'Code incorrect.');
    return json({ token: unlockToken(device.userId) });
  }
  if (settings?.parentalPinHash && !verifyPin(data.currentPin || '', settings.parentalPinHash)) {
    return apiError(403, 'bad_pin', 'Code actuel incorrect.');
  }
  await saveSettings(device.userId, { parentalPinHash: data.pin ? hashPin(data.pin) : null });
  return json({ ok: true as const });
}
