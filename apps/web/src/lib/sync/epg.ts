/**
 * Phase « guide TV » : XMLTV lu en flux, seuls les programmes des chaînes de la
 * playlist et de la fenêtre utile (−2 h / +48 h) sont gardés.
 *
 * Rapprochement : par tvg-id / epg_channel_id ; à défaut, par nom de chaîne
 * (display-name XMLTV), et l'identifiant trouvé est enregistré sur la chaîne.
 * Un guide en échec n'invalide pas la synchro des chaînes : l'erreur est
 * simplement notée dans les métadonnées de la playlist.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createXmltvParser, xtreamXmltvUrl, type XtreamCreds } from '@iptv/shared';
import { schema } from '../db';
import { decryptJson } from '../crypto';
import { fetchSource, responseText, SourceError } from './source';
import { BATCH, type PhaseCtx, type PhaseResult } from './types';

const WINDOW_BEFORE_MS = 2 * 3600_000;
const WINDOW_AFTER_MS = 48 * 3600_000;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(hd|fhd|uhd|sd|4k|hevc)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');

export function epgUrlFor(ctx: PhaseCtx): string | null {
  const p = ctx.playlist;
  if (p.epgUrl) return p.epgUrl;
  if (p.type === 'xtream' && p.epgAuto && p.credentialsEnc) return xtreamXmltvUrl(decryptJson<XtreamCreds>(p.credentialsEnc));
  return ctx.meta().headerEpgUrl ?? null;
}

export async function syncEpg(ctx: PhaseCtx): Promise<PhaseResult> {
  const url = epgUrlFor(ctx);
  if (!url) return 'next';
  const { db, playlist } = ctx;
  const ep = schema.epgPrograms;
  const ch = schema.channels;
  const skip = ctx.job.cursor;
  if (skip === 0) await db.delete(ep).where(eq(ep.playlistId, playlist.id));

  const rows = await db.select({ id: ch.id, epgId: ch.epgChannelId, name: ch.name }).from(ch).where(eq(ch.playlistId, playlist.id));
  const known = new Set<string>();
  const unmatched = new Map<string, number[]>();
  for (const r of rows) {
    if (r.epgId) known.add(r.epgId);
    else {
      const k = norm(r.name);
      if (k) unmatched.set(k, (unmatched.get(k) || []).concat(r.id));
    }
  }

  const from = Date.now() - WINDOW_BEFORE_MS;
  const to = Date.now() + WINDOW_AFTER_MS;
  let matched = 0;
  let pending: (typeof ep.$inferInsert)[] = [];
  const assign: { channelIds: number[]; epgId: string }[] = [];

  const parser = createXmltvParser({
    onChannel: (c) => {
      if (known.has(c.id) || !unmatched.size) return;
      for (const n of c.names) {
        const ids = unmatched.get(norm(n));
        if (ids) {
          assign.push({ channelIds: ids, epgId: c.id });
          unmatched.delete(norm(n));
          known.add(c.id);
          return;
        }
      }
    },
    onProgramme: (p) => {
      if (!known.has(p.channel) || p.stop < from || p.start > to) return;
      if (matched++ < skip) return;
      pending.push({
        playlistId: playlist.id,
        channelEpgId: p.channel,
        start: new Date(p.start),
        stop: new Date(p.stop),
        title: p.title.slice(0, 300),
        description: p.desc ? p.desc.slice(0, 2000) : null,
      });
    },
  });

  const flush = async () => {
    while (assign.length) {
      const a = assign.shift()!;
      await db.update(ch).set({ epgChannelId: a.epgId }).where(and(inArray(ch.id, a.channelIds), isNull(ch.epgChannelId)));
    }
    for (let i = 0; i < pending.length; i += BATCH) await db.insert(ep).values(pending.slice(i, i + BATCH));
    pending = [];
  };

  try {
    const res = await fetchSource(url, { timeoutMs: 60_000 });
    for await (const chunk of responseText(res, url)) {
      parser.push(chunk);
      if (pending.length >= BATCH) {
        await flush();
        await ctx.checkpoint(matched);
        if (ctx.timeUp()) return 'continue';
      }
    }
    parser.end();
    await flush();
    await ctx.checkpoint(matched);
    ctx.patchMeta({ epgPrograms: matched, epgError: null });
  } catch (e) {
    if (!(e instanceof SourceError)) throw e;
    ctx.patchMeta({ epgError: 'Guide TV : ' + e.message });
  }
  return 'next';
}
