import { Logo } from './Logo';

/** En-tête commun : l'utilisateur sait toujours où il est et ce que fait Retour. */
export function ScreenHeader({ title, backHint }: { title: string; backHint: string }) {
  return (
    <header class="screen-header">
      <Logo size={48} />
      <span class="crumb">{title}</span>
      <span class="spacer" />
      <span class="hint">
        <span class="key-chip">Retour</span>
        {backHint}
      </span>
    </header>
  );
}
