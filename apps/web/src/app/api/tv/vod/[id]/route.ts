import { and, eq } from 'drizzle-orm';
import type { MovieDetail } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { imageUrl } from '@/lib/images';
import { ensureMovieDetails } from '@/lib/details';
import { lockedError, tvContext } from '@/lib/tv-api';
import { categoryLocked, isFavorite, progressFor } from '@/lib/user-data';

/** Fiche film : détails (chargés à la demande), favori, position de reprise. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const id = Number((await params).id);
  const db = await getDb();
  const row = await db.query.vodItems.findFirst({
    where: and(eq(schema.vodItems.id, id), eq(schema.vodItems.playlistId, ctx.playlist.id)),
  });
  if (!row) return apiError(404, 'not_found');
  if (!ctx.lockedOk && (await categoryLocked(row.categoryId))) return lockedError();

  const v = await ensureMovieDetails(ctx.playlist, row);
  const [fav, prog] = await Promise.all([isFavorite(ctx.device.userId, 'vod', v.id), progressFor(ctx.device.userId, 'vod', [v.id])]);
  const body: MovieDetail = {
    id: v.id,
    name: v.name,
    poster: imageUrl(ctx.origin, v.poster, 'poster', 360),
    backdrop: imageUrl(ctx.origin, v.backdrop, 'backdrop', 1280),
    year: v.year,
    rating: v.rating,
    plot: v.plot,
    cast: v.cast,
    director: v.director,
    genre: v.genre,
    durationSec: v.durationSec,
    containerExt: v.containerExt,
    favorite: fav,
    progress: prog.get(v.id) ?? null,
  };
  return json(body, { headers: { 'Cache-Control': 'no-store' } });
}
