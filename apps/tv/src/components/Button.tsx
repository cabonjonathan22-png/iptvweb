import type { ComponentChildren } from 'preact';
import { useFocusable, type UseFocusableOpts } from '../nav/hooks';

interface Props extends UseFocusableOpts {
  children: ComponentChildren;
  variant?: 'primary' | 'ghost' | 'danger';
  class?: string;
}

export function Button({ children, variant = 'ghost', class: cls, ...focusOpts }: Props) {
  const { ref, focused } = useFocusable<HTMLDivElement>(focusOpts);
  return (
    <div
      ref={ref}
      role="button"
      class={'btn btn-' + variant + ' focusable' + (focused ? ' is-focused' : '') + (cls ? ' ' + cls : '')}
    >
      {children}
    </div>
  );
}
