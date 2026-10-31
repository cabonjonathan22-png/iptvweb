import { startPairing } from '@/lib/pairing';
import { limits } from '@/lib/ratelimit';
import { clientIp, json, tooMany } from '@/lib/http';

export async function POST(req: Request) {
  const rl = await limits.pairStart().limit(clientIp(req));
  if (!rl.success) return tooMany(rl.reset);
  const res = await startPairing(req.headers.get('user-agent'));
  return json(res, { headers: { 'Cache-Control': 'no-store' } });
}
