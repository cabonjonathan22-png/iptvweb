/**
 * Génère les icônes de la web app (apps/tv/public/icons) depuis le logo.
 * Usage : node scripts/make-icons.cjs (sharp vient des dépendances de Next).
 */
const fs = require('node:fs');
const path = require('node:path');

const store = path.join(__dirname, '..', 'node_modules', '.pnpm');
const dir = fs.readdirSync(store).find((d) => d.startsWith('sharp@'));
const sharp = require(path.join(store, dir, 'node_modules', 'sharp'));
const out = path.join(__dirname, '..', 'apps', 'tv', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });

const ACCENT = '#7c6cff';
// Même triangle que components/Logo.tsx ; `scale` le réduit pour la zone sûre des icônes masquables.
const svg = (size, { rounded, scale }) => {
  const k = (size / 32) * scale;
  const shift = (size - 32 * k) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${rounded ? size * 0.28 : 0}" fill="${ACCENT}"/>` +
      `<path transform="translate(${shift} ${shift}) scale(${k})" d="M13 10.5v11l9-5.5z" fill="#fff"/></svg>`,
  );
};

const ICONS = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  ['maskable-512.png', 512, { rounded: false, scale: 0.72 }],
  // iOS arrondit lui-même et n'accepte pas la transparence.
  ['apple-touch-icon.png', 180, { rounded: false, scale: 1 }],
];

Promise.all(ICONS.map(([name, size, o]) => sharp(svg(size, o)).png().toFile(path.join(out, name)))).then(() =>
  console.log('icônes écrites dans', out),
);
