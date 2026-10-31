'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

/** Bouton d'envoi d'une server action : « Enregistrement… » puis « ✓ Enregistré » pendant 2 s. */
export function SaveButton({
  children,
  className,
  disabled,
  pendingLabel = 'Enregistrement…',
  doneLabel = '✓ Enregistré',
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pendingLabel?: string;
  doneLabel?: string;
}) {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2000);
      wasPending.current = false;
      return () => clearTimeout(t);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <button className={className} disabled={disabled || pending} aria-live="polite">
      {pending ? pendingLabel : saved ? doneLabel : children}
    </button>
  );
}
