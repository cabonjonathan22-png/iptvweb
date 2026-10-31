import { useState } from 'preact/hooks';

/** Couleur stable dérivée du nom (repli quand l'image manque). */
export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return 'hsl(' + (h % 360) + ',42%,30%)';
}

export function initials(name: string): string {
  const words = name.replace(/[^0-9A-Za-zÀ-ÿ\s]/g, ' ').trim().split(/\s+/);
  return (((words[0] || '').charAt(0) + (words[1] || '').charAt(0)).toUpperCase() || '?');
}

/**
 * Logo / affiche avec placeholder élégant (initiales sur couleur générée) tant
 * que l'image n'est pas chargée, ou si elle est absente / cassée. Les lignes
 * hors écran étant démontées par la liste virtualisée, leurs images sont libérées.
 */
export function Img({ src, name, class: cls }: { src: string | null; name: string; class?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const showImg = src && state !== 'error';
  return (
    <div class={'img ' + (cls || '')} style={state === 'ok' ? undefined : { background: colorFor(name) }}>
      {state !== 'ok' && <span class="img-initials">{initials(name)}</span>}
      {showImg && (
        <img
          src={src!}
          alt=""
          style={state === 'ok' ? undefined : { opacity: 0 }}
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
        />
      )}
    </div>
  );
}
