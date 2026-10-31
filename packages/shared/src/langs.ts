/**
 * Langue d'une catégorie, déduite de son nom : les playlists IPTV préfixent
 * presque toujours leurs groupes (« FR | Sport », « [EN] Movies », « Allemagne »).
 * Une catégorie sans langue reconnue reste toujours visible : mieux vaut en
 * montrer trop que cacher une chaîne à tort.
 */
export const CONTENT_LANGS: { code: string; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' },
  { code: 'pt', label: 'Portugais' },
  { code: 'ar', label: 'Arabe' },
  { code: 'nl', label: 'Néerlandais' },
  { code: 'tr', label: 'Turc' },
  { code: 'pl', label: 'Polonais' },
  { code: 'ru', label: 'Russe' },
  { code: 'ro', label: 'Roumain' },
];

const CODES: { [code: string]: string } = {
  FR: 'fr', FRA: 'fr', FRE: 'fr', VF: 'fr', VOSTFR: 'fr',
  EN: 'en', ENG: 'en', UK: 'en', GB: 'en', US: 'en', USA: 'en',
  ES: 'es', ESP: 'es', SP: 'es', SPA: 'es',
  DE: 'de', GER: 'de', DEU: 'de',
  IT: 'it', ITA: 'it',
  PT: 'pt', POR: 'pt', BR: 'pt',
  AR: 'ar', ARA: 'ar', ARB: 'ar',
  NL: 'nl', NED: 'nl',
  TR: 'tr', TUR: 'tr',
  PL: 'pl', POL: 'pl',
  RU: 'ru', RUS: 'ru',
  RO: 'ro', ROM: 'ro',
};

const WORDS: [RegExp, string][] = [
  [/\b(france|french|francaise?s?|vostfr)\b/, 'fr'],
  [/\b(english|united kingdom|usa|anglaise?s?)\b/, 'en'],
  [/\b(spain|spanish|espana|espanol|espagne|espagnole?s?)\b/, 'es'],
  [/\b(germany|german|deutsch|deutschland|allemagne|allemande?s?)\b/, 'de'],
  [/\b(italy|italia|italian|italiano|italie|italien(ne)?s?)\b/, 'it'],
  [/\b(portugal|portuguese|portugues|brasil|brazil|bresil)\b/, 'pt'],
  [/\b(arabic|arabes?|arab)\b/, 'ar'],
  [/\b(netherlands|nederland|dutch|pays-bas)\b/, 'nl'],
  [/\b(turkey|turkish|turkiye|turquie|turc)\b/, 'tr'],
  [/\b(poland|polska|polish|pologne)\b/, 'pl'],
  [/\b(russia|russian|russie|russe)\b/, 'ru'],
  [/\b(romania|romanian|roumanie|roumain)\b/, 'ro'],
];

/** Code en MAJUSCULES au début, ou isolé entre délimiteurs (« | »,« [ ]», « : », « - »). */
const PREFIX = /^[\s|[(*#-]*([A-Z]{2,6})(?=$|[\s|:\])*-])/;
const DELIMITED = /[|[(]\s*([A-Z]{2,6})\s*[|\])]/;

export function detectCategoryLang(name: string): string | null {
  const p = PREFIX.exec(name) || DELIMITED.exec(name);
  if (p && CODES[p[1]!]) return CODES[p[1]!]!;
  const plain = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  for (const [re, code] of WORDS) if (re.test(plain)) return code;
  return null;
}
