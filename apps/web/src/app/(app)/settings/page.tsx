import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/auth';
import { getSettings, toTvSettings } from '@/lib/settings';
import { PinForm, PreferencesForm } from '@/components/SettingsForms';

export const metadata: Metadata = { title: 'Réglages' };

export default async function SettingsPage() {
  const user = await requireUser();
  const s = toTvSettings(await getSettings(user.id));
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Réglages</h1>
        <p className="mt-1 text-muted">Partagés par toutes les TV liées à votre compte ({user.email}).</p>
      </div>
      <section className="card">
        <h2 className="mb-4 font-semibold">Lecture</h2>
        <PreferencesForm s={s} />
      </section>
      <section className="card">
        <h2 className="font-semibold">Contrôle parental</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Les catégories marquées « Verrouillée » dans vos{' '}
          <Link href="/playlists" className="underline hover:text-fg">
            playlists
          </Link>{' '}
          demanderont ce code sur la TV (déverrouillage pour 1 heure).{' '}
          {s.hasPin ? 'Un code est actuellement défini.' : 'Aucun code défini : le verrouillage n’est pas appliqué.'}
        </p>
        <PinForm hasPin={s.hasPin} />
      </section>
    </div>
  );
}
