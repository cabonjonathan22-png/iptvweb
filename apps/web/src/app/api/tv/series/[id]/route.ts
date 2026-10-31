import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Episode, SeriesDetail } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { imageUrl } from '@/lib/images';
import { ensureSeriesDetails } from '@/lib/details';
import { lockedError, tvContext } from '@/lib/tv-api';
import { categoryLocked, isFavorite, progressFor } from '@/lib/user-data';

/** Fiche série : infos, saisons et épisodes (avec progression), épisode à reprendre. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const id = Number((await params).id);
  const db = await getDb();
  const row = await db.query.series.findFirst({
    where: and(eq(schema.series.id, id), eq(schema.series.playlistId, ctx.playlist.id)),
  });
  if (!row) return apiError(404, 'not_found');
  if (!ctx.lockedOk && (await categoryLocked(row.categoryId))) return lockedError();

  const s = await ensureSeriesDetails(ctx.playlist, row);
  const ep = schema.episodes;
  const eps = await db.select().from(ep).where(eq(ep.seriesId, s.id)).orderBy(asc(ep.season), asc(ep.episode), asc(ep.id));
  const prog = await progressFor(ctx.device.userId, 'episode', eps.map((e) => e.id));

  const seasons: SeriesDetail['seasons'] = [];
  for (const e of eps) {
    let season = seasons[seasons.length - 1];
    if (!season || season.season !== e.season) seasons.push((season = { season: e.season, episodes: [] }));
    const item: Episode = {
      id: e.id,
      season: e.season,
      episode: e.episode,
      title: e.title,
      plot: e.plot,
      thumb: imageUrl(ctx.origin, e.thumb, 'poster', 360),
      durationSec: e.durationSec,
      progress: prog.get(e.id) ?? null,
    };
    season.episodes.push(item);
  }

  // Reprise : dernier épisode touché ; s'il est terminé, le suivant.
  let resume: SeriesDetail['resume'] = null;
  if (eps.length) {
    const w = schema.watchProgress;
    const [last] = await db
      .select()
      .from(w)
      .where(and(eq(w.userId, ctx.device.userId), eq(w.kind, 'episode'), inArray(w.itemId, eps.map((e) => e.id))))
      .orderBy(desc(w.updatedAt))
      .limit(1);
    if (last) {
      const idx = eps.findIndex((e) => e.id === last.itemId);
      if (!last.completed) resume = { episodeId: last.itemId, position: last.positionSec };
      else if (eps[idx + 1]) resume = { episodeId: eps[idx + 1]!.id, position: 0 };
    }
  }

  const body: SeriesDetail = {
    id: s.id,
    name: s.name,
    poster: imageUrl(ctx.origin, s.poster, 'poster', 360),
    backdrop: imageUrl(ctx.origin, s.backdrop, 'backdrop', 1280),
    year: s.year,
    rating: s.rating,
    plot: s.plot,
    cast: s.cast,
    genre: s.genre,
    favorite: await isFavorite(ctx.device.userId, 'series', s.id),
    seasons,
    resume,
  };
  return json(body, { headers: { 'Cache-Control': 'no-store' } });
}
