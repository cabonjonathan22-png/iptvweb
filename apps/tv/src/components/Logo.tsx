import { BRAND } from '@iptv/shared';

export function Logo({ size = 56 }: { size?: number }) {
  return (
    <div class="logo">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill={BRAND.accent} />
        <path d="M13 10.5v11l9-5.5z" fill="#fff" />
      </svg>
      <span class="logo-name">{BRAND.name}</span>
    </div>
  );
}
