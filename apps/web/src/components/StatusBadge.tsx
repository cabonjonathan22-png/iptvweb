const STYLES = {
  idle: ['En attente', 'bg-surface-2 text-muted'],
  syncing: ['Synchronisation…', 'bg-accent/15 text-accent-strong'],
  ready: ['À jour', 'bg-ok/10 text-ok'],
  error: ['Erreur', 'bg-danger/10 text-danger'],
} as const;

export function StatusBadge({ status }: { status: keyof typeof STYLES }) {
  const [label, cls] = STYLES[status];
  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ' + cls}>
      {status === 'syncing' && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </span>
  );
}
