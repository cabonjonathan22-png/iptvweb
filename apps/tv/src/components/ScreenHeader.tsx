import { Logo } from './Logo';
import { sendKey } from '../nav/hooks';

/** En-tête commun : l'utilisateur sait toujours où il est et ce que fait Retour. */
export function ScreenHeader({ title, backHint }: { title: string; backHint: string }) {
  return (
    <header class="screen-header">
      <Logo size={48} />
      <span class="crumb">{title}</span>
      <span class="spacer" />
      <span class="hint hint-back" onClick={() => sendKey('back')}>
        <span class="key-chip">Retour</span>
        {backHint}
      </span>
    </header>
  );
}
