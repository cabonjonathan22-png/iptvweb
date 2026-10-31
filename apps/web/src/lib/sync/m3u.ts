/**
 * Synchro M3U (URL ou fichier uploadé), en une phase reprenable.
 *
 * Le texte est parsé au fil du téléchargement et écrit par lots de 1000.
 * Le curseur = nombre d'entrées déjà écrites : si la fonction doit rendre la
 * main, l'invocation suivante retélécharge la source et saute ces entrées
 * (les serveurs IPTV gèrent rarement les requêtes Range de façon fiable).
 */
import { eq } from 'drizzle-orm';
import { classifyM3u, createM3uParser, parseEpisode, type M3uEntry } from '@iptv/shared';
import { schema } from '../db';
import { fetchSource, gzipText, responseText, SourceError } from './source';
import { hashId, type CategoryInput, type ChannelRow, type EpisodeRow, type SeriesRow, type VodRow } from './writer';
import { BATCH, type PhaseCtx, type PhaseResult } from './types';

const NO_GROUP = 'Sans catégorie';

async function source(ctx: PhaseCtx): Promise<AsyncGenerator<string>> {
  const p = ctx.playlist;
  if (p.type === 'm3u_file') {
    const file = await ctx.db.query.playlistFiles.findFirst({
      where: eq(schema.playlistFiles.playlistId, p.id),
    });
    if (!file) throw new SourceError('Aucun fichier n’a été envoyé pour cette playlist.', 'invalid');
    return gzipText(file.gzData);
  }
  if (!p.sourceUrl) throw new SourceError('URL de playlist manquante.', 'invalid');
  // Les panels génèrent souvent la playlist à la demande : la première réponse peut être lente.
  // Reste sous la durée du bail du job (90 s).
  const res = await fetchSource(p.sourceUrl, { timeoutMs: 80_000 });
  return responseText(res, p.sourceUrl);
}

/** « Inception (2010) » -> 2010 */
const yearInName = (n: string) => {
  const m = /\((19|20)(\d{2})\)/.exec(n);
  return m ? parseInt(m[1]! + m[2]!, 10) : null;
};

export async function syncM3u(ctx: PhaseCtx): Promise<PhaseResult> {
  const skip = ctx.job.cursor;
  let index = 0;
  let sawHeader = false;
  let pending: { e: M3uEntry; i: number }[] = [];

  const parser = createM3uParser({
    onHeader: (h) => {
      sawHeader = true;
      if (h.epgUrl) ctx.patchMeta({ headerEpgUrl: h.epgUrl });
    },
    onEntry: (e) => {
      const i = index++;
      if (i >= skip && e.url) pending.push({ e, i });
    },
  });

  const flush = async () => {
    const batch = pending;
    pending = [];
    await writeBatch(ctx, batch);
  };

  let firstChunk = true;
  for await (const chunk of await source(ctx)) {
    if (firstChunk) {
      firstChunk = false;
      // Garde-fou : une page HTML (erreur du panel, page de connexion) n'est pas une playlist.
      if (/^\s*<(!doctype|html)/i.test(chunk)) {
        throw new SourceError('Le serveur a renvoyé une page web au lieu d’une playlist M3U.', 'invalid');
      }
    }
    parser.push(chunk);
    if (pending.length >= BATCH) {
      await flush();
      await ctx.checkpoint(index);
      // Sortir de la boucle ferme le flux réseau proprement.
      if (ctx.timeUp()) return 'continue';
    }
  }
  parser.end();
  await flush();
  await ctx.checkpoint(index);
  if (index === 0) {
    throw new SourceError(
      sawHeader ? 'La playlist est vide.' : 'Ce fichier ne ressemble pas à une playlist M3U.',
      'invalid',
    );
  }
  return 'next';
}

async function writeBatch(ctx: PhaseCtx, batch: { e: M3uEntry; i: number }[]) {
  if (!batch.length) return;
  const { writer, playlist, job } = ctx;
  const base = { playlistId: playlist.id, syncGen: job.gen };

  const cats = new Map<string, CategoryInput>();
  const items = batch.map(({ e, i }) => {
    const kind = classifyM3u(e);
    const group = (e.group || NO_GROUP).slice(0, 200);
    cats.set(kind + '|' + group, { kind, externalId: group, name: group });
    return { e, i, kind, group };
  });
  await writer.ensureCategories(Array.from(cats.values()));

  const live: ChannelRow[] = [];
  const vod: VodRow[] = [];
  const seriesRows = new Map<string, SeriesRow>();
  const eps: { seriesExt: string; row: Omit<EpisodeRow, 'seriesId'> }[] = [];

  for (const { e, i, kind, group } of items) {
    const categoryId = writer.categoryId(kind, group);
    const externalId = hashId(e.url);
    if (kind === 'live') {
      live.push({
        ...base,
        categoryId,
        externalId,
        num: e.tvgChno ?? null,
        name: e.name || e.tvgName || 'Sans nom',
        logo: e.tvgLogo ?? null,
        streamUrl: e.url,
        epgChannelId: e.tvgId ?? null,
        catchup: e.catchup ?? null,
        catchupDays: e.catchupDays ?? null,
        httpUserAgent: e.userAgent ?? null,
        httpReferrer: e.referrer ?? null,
        sortOrder: i,
      });
    } else if (kind === 'vod') {
      vod.push({
        ...base,
        categoryId,
        externalId,
        name: e.name || 'Sans titre',
        poster: e.tvgLogo ?? null,
        year: yearInName(e.name),
        containerExt: (/\.([a-z0-9]{2,4})(\?|$)/i.exec(e.url)?.[1] || '').toLowerCase() || null,
        streamUrl: e.url,
        sortOrder: i,
      });
    } else {
      const ep = parseEpisode(e.name);
      const title = ep ? ep.series : e.tvgName || e.name || 'Sans titre';
      const seriesExt = hashId('series|' + group + '|' + title.toLowerCase());
      if (!seriesRows.has(seriesExt)) {
        seriesRows.set(seriesExt, {
          ...base,
          categoryId,
          externalId: seriesExt,
          name: title,
          poster: e.tvgLogo ?? null,
          sortOrder: i,
        });
      }
      eps.push({
        seriesExt,
        row: {
          ...base,
          externalId,
          season: ep ? ep.season : 1,
          episode: ep ? ep.episode : i,
          title: e.name,
          thumb: e.tvgLogo ?? null,
          containerExt: (/\.([a-z0-9]{2,4})(\?|$)/i.exec(e.url)?.[1] || '').toLowerCase() || null,
          streamUrl: e.url,
        },
      });
    }
  }

  await writer.upsertChannels(live);
  await writer.upsertVod(vod);
  if (seriesRows.size) {
    const ids = await writer.upsertSeries(Array.from(seriesRows.values()));
    await writer.upsertEpisodes(
      eps.filter((x) => ids.has(x.seriesExt)).map((x) => ({ ...x.row, seriesId: ids.get(x.seriesExt)! })),
    );
  }
}
