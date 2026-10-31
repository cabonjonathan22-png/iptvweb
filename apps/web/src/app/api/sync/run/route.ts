import { after } from 'next/server';
import { kickJob, runJob, syncSecret } from '@/lib/sync/runner';
import { apiError, json } from '@/lib/http';

/** Exécution d'un morceau de synchro. Appelé uniquement par le serveur (secret partagé). */
export const maxDuration = 300;

export async function POST(req: Request) {
  if (req.headers.get('authorization') !== 'Bearer ' + syncSecret()) return apiError(401, 'unauthorized');
  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!jobId) return apiError(400, 'missing_job');

  // Réponse immédiate ; le travail continue après l'envoi (waitUntil sur Vercel).
  after(async () => {
    if ((await runJob(jobId)) === 'continue') await kickJob(jobId);
  });
  return json({ accepted: true }, { status: 202 });
}
