'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/auth';
import { hashPin, PIN_RE, verifyPin } from '@/lib/parental';
import { getSettings, saveSettings } from '@/lib/settings';

export type SettingsState = { error?: string; ok?: string } | undefined;

const lang = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(s) ? s : null;
};

export async function savePreferences(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const mode = z.enum(['auto', 'hls', 'ts']).catch('auto').parse(fd.get('playerMode'));
  await saveSettings(user.id, {
    audioLang: lang(fd.get('audioLang')),
    subtitleLang: lang(fd.get('subtitleLang')),
    playerMode: mode,
    livePreview: fd.get('livePreview') === 'on',
  });
  revalidatePath('/settings');
  return { ok: 'Préférences enregistrées. Elles s’appliquent à toutes vos TV.' };
}

export async function savePin(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const current = await getSettings(user.id);
  const remove = fd.get('remove') === '1';
  if (current?.parentalPinHash && !verifyPin(String(fd.get('currentPin') ?? ''), current.parentalPinHash)) {
    return { error: 'Code actuel incorrect.' };
  }
  if (remove) {
    await saveSettings(user.id, { parentalPinHash: null });
    revalidatePath('/settings');
    return { ok: 'Code parental supprimé : les catégories verrouillées sont de nouveau accessibles.' };
  }
  const pin = String(fd.get('pin') ?? '');
  if (!PIN_RE.test(pin)) return { error: 'Le code doit comporter exactement 4 chiffres.' };
  if (pin !== String(fd.get('pinConfirm') ?? '')) return { error: 'Les deux codes ne correspondent pas.' };
  await saveSettings(user.id, { parentalPinHash: hashPin(pin) });
  revalidatePath('/settings');
  return { ok: 'Code parental enregistré.' };
}
