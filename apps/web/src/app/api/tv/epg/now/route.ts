import type { EpgNowNext } from '@iptv/shared';
import { json } from '@/lib/http';
import { programsFor } from '@/lib/epg';
import { tvContext } from '@/lib/tv-api';

/** Programme en cours et suivant pour une liste d'identifiants EPG (?ids=a,b,c — 100 max). */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 100);
  const now = Date.now();
  const map = await programsFor(ctx.playlist.id, ids, now, now + 8 * 3600_000);
  const out: Record<string, EpgNowNext> = {};
  for (const id of ids) {
    const list = map.get(id) || [];
    const i = list.findIndex((p) => p.start <= now && p.stop > now);
    out[id] = i >= 0 ? { now: list[i]!, next: list[i + 1] ?? null } : { now: null, next: list[0] ?? null };
  }
  return json(out, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
