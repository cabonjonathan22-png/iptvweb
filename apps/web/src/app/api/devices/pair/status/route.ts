import { pairingStatus } from '@/lib/pairing';
import { limits } from '@/lib/ratelimit';
import { apiError, clientIp, json, tooMany } from '@/lib/http';

export async function GET(req: Request) {
  const rl = await limits.pairStatus().limit(clientIp(req));
  if (!rl.success) return tooMany(rl.reset);

  const code = new URL(req.url).searchParams.get('code') || '';
  const secret = req.headers.get('x-pairing-secret') || '';
  const res = await pairingStatus(code, secret);
  if (!res) return apiError(404, 'not_found');
  return json(res, { headers: { 'Cache-Control': 'no-store' } });
}
