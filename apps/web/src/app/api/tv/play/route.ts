import { apiError, json } from '@/lib/http';
import { resolvePlayback } from '@/lib/playback';
import { tvContext } from '@/lib/tv-api';

/** ?kind=live|vod|episode&id=…&mode=hls|ts -> URL lisible par la TV (souvent via le proxy de flux). */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const sp = new URL(req.url).searchParams;
  const kind = sp.get('kind');
  const id = Number(sp.get('id'));
  const mode = sp.get('mode');
  if ((kind !== 'live' && kind !== 'vod' && kind !== 'episode') || !Number.isInteger(id)) {
    return apiError(400, 'bad_request');
  }
  const res = await resolvePlayback(ctx.playlist, kind, id, mode === 'ts' || mode === 'hls' ? mode : undefined);
  if (res === 'not_found') return apiError(404, 'not_found', 'Contenu introuvable (playlist resynchronisée ?).');
  if (res === 'no_source') return apiError(404, 'no_source', 'Aucune source de lecture pour ce contenu.');
  return json(res, { headers: { 'Cache-Control': 'no-store' } });
}
