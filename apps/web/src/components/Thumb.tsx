'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Vignette (logo / affiche) avec repli élégant : initiales sur une couleur
 * dérivée du nom si l'image manque ou ne charge pas.
 */
export function Thumb({ src, name, className = 'size-10' }: { src: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Une image rendue côté serveur peut échouer avant l'hydratation (onError jamais appelé).
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, [src]);
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- images de tiers, tailles arbitraires
      <img
        ref={ref}
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={className + ' shrink-0 rounded-lg bg-surface-2 object-contain'}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={className + ' inline-flex shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white/90'}
      style={{ background: colorFor(name) }}
    >
      {initials(name)}
    </span>
  );
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 45% 32%)`;
}
