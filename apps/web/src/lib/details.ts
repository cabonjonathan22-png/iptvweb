/**
 * Fiches détaillées chargées à la demande (première ouverture sur la TV) puis
 * mises en cache en base : get_vod_info / get_series_info pour Xtream, TMDB
 * en complément si configuré. Une source lente ou en panne ne bloque jamais
 * la fiche : on affiche ce qu'on a.
 */
import { eq, sql } from 'drizzle-orm';
import { num, str, xtreamApiUrl, yearOf, type XtreamCreds } from '@iptv/shared';
import { decryptJson } from './crypto';
import { getDb, schema } from './db';
import { fetchJson } from './sync/source';
import { tmdbLookup } from './tmdb';

type Playlist = typeof schema.playlists.$inferSelect;
type Vod = typeof schema.vodItems.$inferSelect;
type Series = typeof schema.series.$inferSelect;

const EPISODES_TTL_MS = 6 * 3600_000;

const creds = (p: Playlist) => (p.type === 'xtream' && p.credentialsEnc ? decryptJson<XtreamCreds>(p.credentialsEnc) : null);

/** « 01:52:30 » ou secondes -> secondes. */
function seconds(secs: unknown, hms: unknown): number | null {
  const n = num(secs as never);
  if (n && n > 0) return Math.round(n);
  const m = typeof hms === 'string' ? /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(hms) : null;
  if (!m) return null;
  return m[3] ? +m[1]! * 3600 + +m[2]! * 60 + +m[3] : +m[1]! * 60 + +m[2]!;
}

const firstOf = (v: unknown) => str(Array.isArray(v) ? v[0] : v);

/* ------------------------------------------------------------------ Films */

export async function ensureMovieDetails(p: Playlist, v: Vod): Promise<Vod> {
  if (v.detailsFetchedAt) return v;
  const patch: Partial<Vod> = {};
  const c = creds(p);
  if (c) {
    type R = { info?: Record<string, unknown> };
    const r = await fetchJson<R>(xtreamApiUrl(c, 'get_vod_info', { vod_id: v.externalId }), 8000).catch(() => null);
    const i = r?.info;
    if (i && typeof i === 'object') {
      patch.plot = str(i.plot) || str(i.description) || v.plot;
      patch.cast = str(i.cast) || str(i.actors) || v.cast;
      patch.director = str(i.director) || v.director;
      patch.genre = str(i.genre) || v.genre;
      patch.durationSec = seconds(i.duration_secs, i.duration) ?? v.durationSec;
      patch.backdrop = firstOf(i.backdrop_path) || v.backdrop;
      patch.poster = v.poster || str(i.cover_big) || str(i.movie_image);
      patch.rating = num(i.rating as never) ?? v.rating;
      patch.year = v.year ?? yearOf(str(i.releasedate) || str(i.release_date));
      patch.tmdbId = num(i.tmdb_id as never) ?? v.tmdbId;
    }
  }
  const merged = { ...v, ...patch };
  if (!merged.plot || !merged.poster) {
    const t = await tmdbLookup('movie', v.name, merged.year);
    if (t) {
      Object.assign(patch, {
        plot: merged.plot || t.plot,
        poster: merged.poster || t.poster,
        backdrop: merged.backdrop || t.backdrop,
        rating: merged.rating ?? t.rating,
        year: merged.year ?? t.year,
        cast: merged.cast || t.cast,
        director: merged.director || t.director,
        genre: merged.genre || t.genre,
        tmdbId: t.tmdbId,
      });
    }
  }
  patch.detailsFetchedAt = new Date();
  const db = await getDb();
  await db.update(schema.vodItems).set(patch).where(eq(schema.vodItems.id, v.id));
  return { ...v, ...patch };
}

/* ----------------------------------------------------------------- Séries */

interface XtreamEpisode {
  id: unknown;
  episode_num?: unknown;
  title?: unknown;
  season?: unknown;
  container_extension?: unknown;
  info?: { movie_image?: unknown; plot?: unknown; duration_secs?: unknown; duration?: unknown };
}

export async function ensureSeriesDetails(p: Playlist, s: Series): Promise<Series> {
  const fresh = s.episodesFetchedAt && Date.now() - s.episodesFetchedAt.getTime() < EPISODES_TTL_MS;
  if (fresh) return s;
  const db = await getDb();
  const patch: Partial<Series> = {};
  const c = creds(p);
  if (c) {
    type R = { info?: Record<string, unknown>; episodes?: Record<string, XtreamEpisode[]> | XtreamEpisode[] };
    const r = await fetchJson<R>(xtreamApiUrl(c, 'get_series_info', { series_id: s.externalId }), 10_000).catch(() => null);
    if (r) {
      const i = r.info || {};
      patch.plot = str(i.plot) || s.plot;
      patch.cast = str(i.cast) || s.cast;
      patch.genre = str(i.genre) || s.genre;
      patch.backdrop = firstOf(i.backdrop_path) || s.backdrop;
      patch.rating = num(i.rating as never) ?? s.rating;
      const list: XtreamEpisode[] = Array.isArray(r.episodes)
        ? r.episodes
        : Object.values(r.episodes || {}).flat();
      const rows = list
        .filter((e) => str(e.id))
        .map((e, idx) => ({
          seriesId: s.id,
          playlistId: p.id,
          externalId: str(e.id)!,
          season: num(e.season as never) ?? 1,
          episode: num(e.episode_num as never) ?? idx + 1,
          title: str(e.title),
          plot: str(e.info?.plot),
          thumb: str(e.info?.movie_image),
          durationSec: seconds(e.info?.duration_secs, e.info?.duration),
          containerExt: str(e.container_extension),
          streamUrl: null,
        }));
      const ep = schema.episodes;
      for (let k = 0; k < rows.length; k += 500) {
        await db
          .insert(ep)
          .values(rows.slice(k, k + 500))
          .onConflictDoUpdate({
            target: [ep.seriesId, ep.externalId],
            set: {
              season: sql`excluded.season`,
              episode: sql`excluded.episode`,
              title: sql`excluded.title`,
              plot: sql`excluded.plot`,
              thumb: sql`excluded.thumb`,
              durationSec: sql`excluded.duration_sec`,
              containerExt: sql`excluded.container_ext`,
            },
          });
      }
    }
  }
  const merged = { ...s, ...patch };
  if (!merged.plot || !merged.poster) {
    const t = await tmdbLookup('tv', s.name, merged.year);
    if (t) {
      Object.assign(patch, {
        plot: merged.plot || t.plot,
        poster: merged.poster || t.poster,
        backdrop: merged.backdrop || t.backdrop,
        rating: merged.rating ?? t.rating,
        year: merged.year ?? t.year,
        cast: merged.cast || t.cast,
        genre: merged.genre || t.genre,
        tmdbId: t.tmdbId,
      });
    }
  }
  patch.episodesFetchedAt = new Date();
  await db.update(schema.series).set(patch).where(eq(schema.series.id, s.id));
  return { ...s, ...patch };
}
