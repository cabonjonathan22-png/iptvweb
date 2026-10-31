const nf = new Intl.NumberFormat('fr-FR');

type PlaylistType = 'm3u_url' | 'm3u_file' | 'xtream';

interface Step {
  label: string;
  phases: string[];
  /** Unité du compteur en direct (nombre d'éléments traités). */
  unit?: string;
}

const M3U_STEPS: Step[] = [
  { label: 'Lecture de la playlist', phases: ['m3u'], unit: 'entrées' },
  { label: 'Guide TV', phases: ['epg'], unit: 'programmes' },
  { label: 'Finalisation', phases: ['finalize'] },
];

const XTREAM_STEPS: Step[] = [
  { label: 'Chaînes TV', phases: ['live_categories', 'live_streams'], unit: 'chaînes' },
  { label: 'Films', phases: ['vod_categories', 'vod_streams'], unit: 'films' },
  { label: 'Séries', phases: ['series_categories', 'series'], unit: 'séries' },
  { label: 'Guide TV', phases: ['epg'], unit: 'programmes' },
  { label: 'Finalisation', phases: ['finalize'] },
];

/**
 * Progression d'une synchro : barre et liste d'étapes. La taille totale d'une
 * source n'est pas connue à l'avance : la barre avance par étape, et le compteur
 * affiche ce qui a réellement été traité.
 */
export function SyncProgress({
  type,
  phase,
  cursor,
  compact,
}: {
  type: PlaylistType;
  phase: string | null;
  cursor: number;
  compact?: boolean;
}) {
  const steps = type === 'xtream' ? XTREAM_STEPS : M3U_STEPS;
  const found = phase ? steps.findIndex((s) => s.phases.includes(phase)) : 0;
  const current = found < 0 ? 0 : found;
  const percent = Math.round(((current + 0.5) / steps.length) * 100);
  const step = steps[current]!;

  return (
    <div role="status" className="w-full space-y-3 rounded-xl bg-accent/10 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {step.label}
          {step.unit && cursor > 0 && (
            <span className="ml-2 font-normal text-accent-strong tabular-nums">
              {nf.format(cursor)} {step.unit}
            </span>
          )}
        </p>
        <p className="text-sm text-muted">
          Étape {current + 1} sur {steps.length}
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="sync-bar h-full rounded-full" style={{ width: percent + '%' }} />
      </div>

      {!compact && (
        <ol className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {steps.map((s, i) => (
            <li key={s.label} className={'flex items-center gap-1.5 ' + (i > current ? 'text-muted' : '')}>
              {i < current ? (
                <span className="text-ok">✓</span>
              ) : i === current ? (
                <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              ) : (
                <span className="size-1.5 rounded-full bg-muted/50" />
              )}
              {s.label}
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-muted">Vous pouvez fermer cette page : la synchronisation continue sans vous.</p>
    </div>
  );
}
