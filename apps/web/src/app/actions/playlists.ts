'use server';

import { and, count, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { normalizeServer, xtreamFromM3uUrl, type XtreamCreds } from '@iptv/shared';
import { currentUser } from '@/auth';
import { getDb, schema } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { MAX_PLAYLISTS_PER_USER, ownedPlaylist } from '@/lib/playlists';
import { assertPublicUrl, SourceError } from '@/lib/sync/source';
import { checkXtreamAccount } from '@/lib/sync/xtream';
import { kickJob, startSync } from '@/lib/sync/runner';

export type PlaylistFormState =
  | {
      error?: string;
      playlistId?: string;
      /** Valeurs saisies (hors mot de passe), réaffichées après une erreur : React réinitialise le formulaire. */
      values?: Record<string, string>;
    }
  | undefined;

const echo = (fd: FormData) => {
  const v: Record<string, string> = {};
  for (const k of ['name', 'url', 'server', 'username', 'epgUrl', 'epgAuto']) v[k] = String(fd.get(k) ?? '');
  return v;
};

async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function optionalUrl(raw: string): Promise<string | null> {
  if (!raw) return null;
  await assertPublicUrl(raw);
  return raw;
}

async function sync(playlistId: string) {
  await kickJob(await startSync(playlistId));
}

/* ------------------------------------------------------------- Création */

export async function createPlaylist(_prev: PlaylistFormState, fd: FormData): Promise<PlaylistFormState> {
  const user = await requireUser();
  const db = await getDb();
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.playlists)
    .where(eq(schema.playlists.userId, user.id));
  if (n >= MAX_PLAYLISTS_PER_USER) return { error: `Limite de ${MAX_PLAYLISTS_PER_USER} playlists atteinte.`, values: echo(fd) };

  const type = z.enum(['m3u_url', 'm3u_file', 'xtream']).safeParse(fd.get('type'));
  if (!type.success) return { error: 'Type de source invalide.', values: echo(fd) };
  const name = field(fd, 'name').slice(0, 80) || 'Ma playlist';

  let values: typeof schema.playlists.$inferInsert;
  try {
    const epgUrl = await optionalUrl(field(fd, 'epgUrl'));
    if (type.data === 'm3u_url') {
      const url = field(fd, 'url');
      if (!url) return { error: "Saisissez l'URL de la playlist.", values: echo(fd) };
      await assertPublicUrl(url);
      // Lien get.php d'un panel : l'API Xtream est bien plus fiable que la génération du M3U
      // (souvent très lente). Repli sur le M3U si le panel ne répond pas à l'API.
      const fromUrl = xtreamFromM3uUrl(url);
      const account = fromUrl ? await checkXtreamAccount(fromUrl).catch(() => null) : null;
      values = account
        ? { userId: user.id, name, type: 'xtream', credentialsEnc: encryptJson(fromUrl!), epgUrl, epgAuto: !epgUrl, meta: account }
        : { userId: user.id, name, type: 'm3u_url', sourceUrl: url, epgUrl };
    } else if (type.data === 'm3u_file') {
      values = { userId: user.id, name, type: 'm3u_file', epgUrl };
    } else {
      const creds: XtreamCreds = {
        server: normalizeServer(field(fd, 'server')),
        username: field(fd, 'username'),
        password: String(fd.get('password') ?? ''),
      };
      if (!field(fd, 'server') || !creds.username || !creds.password) {
        return { error: 'Serveur, identifiant et mot de passe sont requis.', values: echo(fd) };
      }
      const account = await checkXtreamAccount(creds);
      values = {
        userId: user.id,
        name,
        type: 'xtream',
        credentialsEnc: encryptJson(creds),
        epgUrl,
        epgAuto: fd.get('epgAuto') === 'on' && !epgUrl,
        meta: account,
      };
    }
  } catch (e) {
    if (e instanceof SourceError) return { error: e.message, values: echo(fd) };
    throw e;
  }

  const [row] = await db.insert(schema.playlists).values(values).returning({ id: schema.playlists.id });
  const id = row!.id;

  // Première playlist : on l'assigne aux TV qui n'en ont pas.
  await db
    .update(schema.devices)
    .set({ playlistId: id })
    .where(and(eq(schema.devices.userId, user.id), sql`${schema.devices.playlistId} is null`));

  revalidatePath('/playlists');
  // Fichier : le client envoie maintenant le contenu à /api/playlists/[id]/file.
  if (type.data === 'm3u_file') return { playlistId: id };
  await sync(id);
  redirect('/playlists/' + id);
}

/* --------------------------------------------------------- Modification */

export async function updatePlaylist(_prev: PlaylistFormState, fd: FormData): Promise<PlaylistFormState> {
  const user = await requireUser();
  const p = await ownedPlaylist(user.id, field(fd, 'id'));
  if (!p) return { error: 'Playlist introuvable.' };

  const set: Partial<typeof schema.playlists.$inferInsert> = {
    name: field(fd, 'name').slice(0, 80) || p.name,
    updatedAt: new Date(),
  };
  let resync = false;
  try {
    const epgUrl = await optionalUrl(field(fd, 'epgUrl'));
    set.epgUrl = epgUrl;
    if (p.type === 'm3u_url') {
      const url = field(fd, 'url');
      if (url && url !== p.sourceUrl) {
        await assertPublicUrl(url);
        set.sourceUrl = url;
        resync = true;
      }
    } else if (p.type === 'xtream') {
      const old = decryptJson<XtreamCreds>(p.credentialsEnc!);
      const next: XtreamCreds = {
        server: field(fd, 'server') ? normalizeServer(field(fd, 'server')) : old.server,
        username: field(fd, 'username') || old.username,
        // Mot de passe vide = inchangé (il n'est jamais renvoyé au navigateur).
        password: String(fd.get('password') ?? '') || old.password,
      };
      if (next.server !== old.server || next.username !== old.username || next.password !== old.password) {
        set.meta = { ...p.meta, ...(await checkXtreamAccount(next)) };
        set.credentialsEnc = encryptJson(next);
        resync = true;
      }
      set.epgAuto = fd.get('epgAuto') === 'on' && !epgUrl;
    }
  } catch (e) {
    if (e instanceof SourceError) return { error: e.message };
    throw e;
  }

  const db = await getDb();
  await db.update(schema.playlists).set(set).where(eq(schema.playlists.id, p.id));
  if (resync) await sync(p.id);
  revalidatePath('/playlists/' + p.id);
  return {};
}

export async function syncPlaylist(fd: FormData) {
  const user = await requireUser();
  const p = await ownedPlaylist(user.id, field(fd, 'id'));
  if (!p) return;
  await sync(p.id);
  revalidatePath('/playlists/' + p.id);
  revalidatePath('/playlists');
}

export async function deletePlaylist(fd: FormData) {
  const user = await requireUser();
  const p = await ownedPlaylist(user.id, field(fd, 'id'));
  if (!p) return;
  const db = await getDb();
  // Cascade : catégories, contenus, EPG, jobs ; les TV assignées repassent à « aucune ».
  await db.delete(schema.playlists).where(eq(schema.playlists.id, p.id));
  revalidatePath('/playlists');
  redirect('/playlists');
}

/* ------------------------------------------------------------ Catégories */

const catOps = z.enum(['hide', 'show', 'lock', 'unlock', 'up', 'down', 'rename']);

export async function updateCategory(fd: FormData) {
  const user = await requireUser();
  const op = catOps.parse(fd.get('op'));
  const catId = z.coerce.number().int().positive().parse(fd.get('categoryId'));
  const db = await getDb();
  const c = schema.categories;
  const cat = await db.query.categories.findFirst({ where: eq(c.id, catId) });
  if (!cat || !(await ownedPlaylist(user.id, cat.playlistId))) return;

  if (op === 'hide' || op === 'show') {
    await db.update(c).set({ hidden: op === 'hide' }).where(eq(c.id, catId));
  } else if (op === 'lock' || op === 'unlock') {
    await db.update(c).set({ locked: op === 'lock' }).where(eq(c.id, catId));
  } else if (op === 'rename') {
    const name = field(fd, 'name').slice(0, 120);
    await db.update(c).set({ customName: name && name !== cat.name ? name : null }).where(eq(c.id, catId));
  } else {
    // Renumérote 0..n-1 (les synchros peuvent laisser des doublons), puis échange avec le voisin.
    await db.execute(sql`
      update ${c} set sort_order = s.rn
      from (select id, (row_number() over (order by sort_order, id) - 1)::int as rn
            from ${c} where playlist_id = ${cat.playlistId} and kind = ${cat.kind}) s
      where ${c.id} = s.id and ${c.sortOrder} <> s.rn`);
    const me = await db.query.categories.findFirst({ where: eq(c.id, catId) });
    const target = me!.sortOrder + (op === 'up' ? -1 : 1);
    const other = await db.query.categories.findFirst({
      where: and(eq(c.playlistId, cat.playlistId), eq(c.kind, cat.kind), eq(c.sortOrder, target)),
    });
    if (other) {
      await db.update(c).set({ sortOrder: target }).where(eq(c.id, me!.id));
      await db.update(c).set({ sortOrder: me!.sortOrder }).where(eq(c.id, other.id));
    }
  }
  // Invalide les ETag côté TV (ordre / noms / masquage changés).
  await db.update(schema.playlists).set({ updatedAt: new Date() }).where(eq(schema.playlists.id, cat.playlistId));
  revalidatePath('/playlists/' + cat.playlistId);
}
