import { apiError, json } from '@/lib/http';
import { resolveCatchup, resolvePlayback } from '@/lib/playback';
import { lockedError, tvContext } from '@/lib/tv-api';

/** ?kind=live|vod|episode&id=…&mode=hls|ts -> URL lisible par la TV (souvent via le proxy de flux). */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const sp = new URL(req.url).searchParams;
  const kind = sp.get('kind');
  const id = Number(sp.get('id'));
  const mode = sp.get('mode');
  const relay = sp.get('relay') === 'backup' ? 'backup' : 'main';
  if (kind === 'catchup') {
    const start = Number(sp.get('start'));
    const stop = Number(sp.get('stop'));
    if (!Number.isInteger(id) || !isFinite(start) || !isFinite(stop)) return apiError(400, 'bad_request');
    const r = await resolveCatchup(ctx.playlist, id, start, stop, mode === 'ts' || mode === 'hls' ? mode : undefined, ctx.lockedOk, relay);
    if (r === 'locked') return lockedError();
    if (r === 'not_found') return apiError(404, 'not_found', 'Chaîne introuvable (playlist resynchronisée ?).');
    if (r === 'no_catchup') return apiError(400, 'no_catchup', "Cette chaîne ne propose pas de replay.");
    if (r === 'bad_window') return apiError(400, 'bad_window', "Ce programme n'est pas disponible en replay.");
    if (r === 'no_source') return apiError(404, 'no_source', "Le replay de cette chaîne n'est pas exploitable.");
    return json(r, { headers: { 'Cache-Control': 'no-store' } });
  }
  if ((kind !== 'live' && kind !== 'vod' && kind !== 'episode') || !Number.isInteger(id)) {
    return apiError(400, 'bad_request');
  }
  const res = await resolvePlayback(ctx.playlist, kind, id, mode === 'ts' || mode === 'hls' ? mode : undefined, ctx.lockedOk, relay);
  if (res === 'locked') return lockedError();
  if (res === 'not_found') return apiError(404, 'not_found', 'Contenu introuvable (playlist resynchronisée ?).');
  if (res === 'no_source') return apiError(404, 'no_source', 'Aucune source de lecture pour ce contenu.');
  return json(res, { headers: { 'Cache-Control': 'no-store' } });
}
