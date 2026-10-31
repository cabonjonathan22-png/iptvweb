import { z } from 'zod';
import { apiError, json } from '@/lib/http';
import { getSettings, saveSettings, toTvSettings } from '@/lib/settings';
import { deviceOnly } from '@/lib/tv-api';

const lang = z.string().trim().toLowerCase().regex(/^[a-z]{2,3}$/).nullable();
const body = z.object({
  audioLang: lang.optional(),
  subtitleLang: lang.optional(),
  playerMode: z.enum(['auto', 'hls', 'ts']).optional(),
  livePreview: z.boolean().optional(),
});

/** Réglages du compte (partagés par toutes les TV de l'utilisateur). */
export async function GET(req: Request) {
  const device = await deviceOnly(req);
  if (device instanceof Response) return device;
  return json(toTvSettings(await getSettings(device.userId)), { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  const device = await deviceOnly(req);
  if (device instanceof Response) return device;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request');
  return json(toTvSettings(await saveSettings(device.userId, parsed.data)));
}
