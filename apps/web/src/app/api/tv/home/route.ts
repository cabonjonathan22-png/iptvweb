import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { ContinueItem, HomeResponse } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { json } from '@/lib/http';
import { imageUrl } from '@/lib/images';
import { tvContext, visibleCategory } from '@/lib/tv-api';
import { channelColumns, toPoster, toTvChannel } from '@/lib/tv-channels';

const ROW = 20;

/** Rangées de l'accueil (une seule requête HTTP pour un démarrage rapide). */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const uid = ctx.device.userId;
  const pid = ctx.playlist.id;
  const c = schema.categories;
  const ch = schema.channels;
  const v = schema.vodItems;
  const s = schema.series;
  const e = schema.episodes;
  const w = schema.watchProgress;
  const f = schema.favorites;

  const [progress, favChannels, recentChannels, recentMovies, latestSeries] = await Promise.all([
    db
      .select()
      .from(w)
      .where(and(eq(w.userId, uid), inArray(w.kind, ['vod', 'episode']), eq(w.completed, false), gt(w.positionSec, 30)))
      .orderBy(desc(w.updatedAt))
      .limit(60),
    db
      .select(channelColumns)
      .from(f)
      .innerJoin(ch, eq(ch.id, f.itemId))
      .leftJoin(c, eq(c.id, ch.categoryId))
      .where(and(eq(f.userId, uid), eq(f.kind, 'live'), eq(ch.playlistId, pid), visibleCategory(ch.categoryId, ctx.lockedOk)))
      .orderBy(f.sortOrder, desc(f.createdAt))
      .limit(30),
    db
      .select(channelColumns)
      .from(w)
      .innerJoin(ch, eq(ch.id, w.itemId))
      .leftJoin(c, eq(c.id, ch.categoryId))
      .where(and(eq(w.userId, uid), eq(w.kind, 'live'), eq(ch.playlistId, pid), visibleCategory(ch.categoryId, ctx.lockedOk)))
      .orderBy(desc(w.updatedAt))
      .limit(ROW),
    db
      .select({ id: v.id, name: v.name, poster: v.poster, year: v.year, rating: v.rating })
      .from(v)
      .leftJoin(c, eq(c.id, v.categoryId))
      .where(and(eq(v.playlistId, pid), visibleCategory(v.categoryId, ctx.lockedOk)))
      .orderBy(sql`${v.addedAt} desc nulls last`, desc(v.id))
      .limit(ROW),
    db
      .select({ id: s.id, name: s.name, poster: s.poster, year: s.year, rating: s.rating })
      .from(s)
      .leftJoin(c, eq(c.id, s.categoryId))
      .where(and(eq(s.playlistId, pid), visibleCategory(s.categoryId, ctx.lockedOk)))
      .orderBy(sql`${s.addedAt} desc nulls last`, desc(s.id))
      .limit(ROW),
  ]);

  // « Reprendre la lecture » : films et épisodes de la playlist active.
  const vodIds = progress.filter((p) => p.kind === 'vod').map((p) => p.itemId);
  const epIds = progress.filter((p) => p.kind === 'episode').map((p) => p.itemId);
  const [vods, eps] = await Promise.all([
    vodIds.length
      ? db
          .select({ id: v.id, name: v.name, poster: v.poster, backdrop: v.backdrop })
          .from(v)
          .leftJoin(c, eq(c.id, v.categoryId))
          .where(and(inArray(v.id, vodIds), eq(v.playlistId, pid), visibleCategory(v.categoryId, ctx.lockedOk)))
      : Promise.resolve([]),
    epIds.length
      ? db
          .select({ id: e.id, season: e.season, episode: e.episode, title: e.title, thumb: e.thumb, seriesId: s.id, seriesName: s.name, poster: s.poster })
          .from(e)
          .innerJoin(s, eq(s.id, e.seriesId))
          .leftJoin(c, eq(c.id, s.categoryId))
          .where(and(inArray(e.id, epIds), eq(e.playlistId, pid), visibleCategory(s.categoryId, ctx.lockedOk)))
      : Promise.resolve([]),
  ]);
  const vodMap = new Map(vods.map((x) => [x.id, x]));
  const epMap = new Map(eps.map((x) => [x.id, x]));
  const seenSeries = new Set<number>();
  const cont: ContinueItem[] = [];
  for (const p of progress) {
    const prog = { position: p.positionSec, duration: p.durationSec, completed: p.completed };
    if (p.kind === 'vod') {
      const x = vodMap.get(p.itemId);
      if (x) cont.push({ kind: 'vod', id: x.id, parentId: x.id, name: x.name, subtitle: null, image: imageUrl(ctx.origin, x.backdrop || x.poster, x.backdrop ? 'backdrop' : 'poster', x.backdrop ? 960 : 360), progress: prog });
    } else {
      const x = epMap.get(p.itemId);
      // Une seule entrée par série (l'épisode le plus récent).
      if (x && !seenSeries.has(x.seriesId)) {
        seenSeries.add(x.seriesId);
        cont.push({
          kind: 'episode',
          id: x.id,
          parentId: x.seriesId,
          name: x.seriesName,
          subtitle: 'S' + x.season + ' · E' + x.episode + (x.title ? ' · ' + x.title : ''),
          image: imageUrl(ctx.origin, x.thumb || x.poster, 'poster', 360),
          progress: prog,
        });
      }
    }
    if (cont.length >= ROW) break;
  }

  const body: HomeResponse = {
    continue: cont,
    favoriteChannels: favChannels.map((r) => toTvChannel(r, ctx.origin)),
    recentChannels: recentChannels.map((r) => toTvChannel(r, ctx.origin)),
    recentMovies: recentMovies.map((r) => toPoster(r, ctx.origin)),
    series: latestSeries.map((r) => toPoster(r, ctx.origin)),
  };
  return json(body, { headers: { 'Cache-Control': 'no-store' } });
}
