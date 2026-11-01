/** Icônes de l'interface, tracées dans une grille de 24 : aucune police ni image à charger. */
const STROKE: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  live: 'M3 7h18v12H3zM8 3l4 4 4-4',
  movies: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  series: 'M7 7h13v13H7zM4 4h13M4 4v13',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',
  back: 'M15 5l-7 7 7 7',
  tracks: 'M3 5h18v14H3zM7 15h4M14 15h3M7 11h10',
  cast: 'M3 8V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6M3 11a8 8 0 0 1 8 8M3 15a4 4 0 0 1 4 4M3 19h.01',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  replay: 'M4 12a8 8 0 1 0 2.6-5.9L4 8.5M4 4v4.5h4.5M12 8v4l3 2',
  pip: 'M3 5h18v14H3zM12 12h6v4h-6z',
  airplay: 'M6 17H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-2M12 15l5 6H7z',
  last: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  chevronUp: 'M5 15l7-7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
  heart: 'M12 20s-7-4.6-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.4-9 9-9 9z',
  rewind: 'M12 5a8 8 0 1 1-8 8M12 5V1L8 5l4 4',
  forward: 'M12 5a8 8 0 1 0 8 8M12 5V1l4 4-4 4',
};

const FILLED: Record<string, string> = {
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  prev: 'M6 5h2.5v14H6zM20 5v14L9 12z',
  next: 'M15.5 5H18v14h-2.5zM4 5v14l11-7z',
  heartOn: STROKE.heart!,
};

export type IconName = string;

export function Icon({ name, size = 24, label }: { name: IconName; size?: number; label?: string }) {
  const filled = FILLED[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d={filled || STROKE[name]} />
      {label && (
        <text x="12" y="16.5" font-size="7.5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">
          {label}
        </text>
      )}
    </svg>
  );
}
