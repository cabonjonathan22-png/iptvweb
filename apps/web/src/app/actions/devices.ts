'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUser } from '@/auth';
import { getDb, schema } from '@/lib/db';
import { confirmPairing } from '@/lib/pairing';
import { limits } from '@/lib/ratelimit';

export type LinkState = { error?: string } | undefined;

const REASONS: Record<string, string> = {
  invalid_code: 'Le code doit faire 6 caractères (lettres et chiffres, sans 0, O, 1 ni I).',
  expired_or_unknown: "Code introuvable ou expiré. Vérifiez l'écran de la TV : un nouveau code s'affiche toutes les 10 minutes.",
  already_linked: 'Cette TV vient déjà d’être liée.',
};

async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

export async function linkDevice(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const user = await requireUser();
  const rl = await limits.pairConfirm().limit(user.id);
  if (!rl.success) return { error: 'Trop de tentatives. Patientez quelques minutes.' };

  const res = await confirmPairing(
    user.id,
    String(formData.get('code') || ''),
    String(formData.get('name') || ''),
  );
  if (!res.ok) return { error: REASONS[res.reason] };
  revalidatePath('/devices');
  redirect('/devices?linked=' + encodeURIComponent(res.device.name));
}

const idSchema = z.uuid();

export async function renameDevice(formData: FormData) {
  const user = await requireUser();
  const id = idSchema.parse(formData.get('id'));
  const name = z.string().trim().min(1).max(60).parse(formData.get('name'));
  const db = await getDb();
  await db
    .update(schema.devices)
    .set({ name })
    .where(and(eq(schema.devices.id, id), eq(schema.devices.userId, user.id)));
  revalidatePath('/devices');
}

export async function revokeDevice(formData: FormData) {
  const user = await requireUser();
  const id = idSchema.parse(formData.get('id'));
  const db = await getDb();
  // Supprimer la ligne invalide le token : la TV recevra un 401 et retournera au pairing.
  await db.delete(schema.devices).where(and(eq(schema.devices.id, id), eq(schema.devices.userId, user.id)));
  revalidatePath('/devices');
}

export async function assignPlaylist(formData: FormData) {
  const user = await requireUser();
  const id = idSchema.parse(formData.get('id'));
  const raw = String(formData.get('playlistId') || '');
  const playlistId = raw ? idSchema.parse(raw) : null;
  const db = await getDb();
  if (playlistId) {
    const owned = await db.query.playlists.findFirst({
      columns: { id: true },
      where: (p, { and, eq }) => and(eq(p.id, playlistId), eq(p.userId, user.id)),
    });
    if (!owned) return;
  }
  await db
    .update(schema.devices)
    .set({ playlistId })
    .where(and(eq(schema.devices.id, id), eq(schema.devices.userId, user.id)));
  revalidatePath('/devices');
}
