import { and, eq } from 'drizzle-orm';
import type { EpgProgram } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { programsFor } from '@/lib/epg';
import { tvContext } from '@/lib/tv-api';

const MAX_SPAN_MS = 48 * 3600_000;

/** Programmes d'une chaîne sur [from, to] (liste du replay sur téléphone). */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get('id'));
  const from = Number(sp.get('from'));
  const to = Number(sp.get('to'));
  if (!Number.isInteger(id) || !isFinite(from) || !isFinite(to) || to <= from || to - from > MAX_SPAN_MS) return apiError(400, 'bad_request');
  const db = await getDb();
  const ch = schema.channels;
  const [row] = await db
    .select({ epgId: ch.epgChannelId })
    .from(ch)
    .where(and(eq(ch.id, id), eq(ch.playlistId, ctx.playlist.id)))
    .limit(1);
  if (!row) return apiError(404, 'not_found');
  const map = await programsFor(ctx.playlist.id, row.epgId ? [row.epgId] : [], from, to);
  const programs: EpgProgram[] = (row.epgId && map.get(row.epgId)) || [];
  return json(programs, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
