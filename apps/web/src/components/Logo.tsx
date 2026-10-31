import { BRAND } from '@iptv/shared';

/** Logo provisoire : carré arrondi + triangle de lecture. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill={BRAND.accent} />
      <path d="M13 10.5v11l9-5.5z" fill="#fff" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight">
      <LogoMark />
      {BRAND.name}
    </span>
  );
}
