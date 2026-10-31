/**
 * Codes de synchronisation TV <-> compte.
 * Alphabet sans caractères ambigus (0/O, 1/I) pour une saisie sans erreur
 * depuis un téléphone en lisant l'écran de la TV.
 */
export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_LENGTH = 6;
export const PAIR_CODE_TTL_SECONDS = 600;
export const PAIR_POLL_INTERVAL_MS = 3000;

/**
 * Génère un code à partir d'une source d'octets aléatoires (crypto.getRandomValues
 * côté navigateur, crypto.randomBytes côté Node). Les octets au-delà du dernier
 * multiple de la taille de l'alphabet sont rejetés pour éviter le biais du modulo
 * (sans effet avec 32 symboles, mais robuste si l'alphabet change).
 */
export function generatePairCode(randomBytes: (n: number) => Uint8Array): string {
  const n = PAIR_CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < PAIR_CODE_LENGTH) {
    const bytes = randomBytes(PAIR_CODE_LENGTH * 2);
    for (let i = 0; i < bytes.length && out.length < PAIR_CODE_LENGTH; i++) {
      const b = bytes[i]!;
      if (b < limit) out += PAIR_CODE_ALPHABET[b % n];
    }
  }
  return out;
}

/** Normalise une saisie utilisateur : majuscules, sans espaces ni tirets. */
export function normalizePairCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidPairCode(code: string): boolean {
  if (code.length !== PAIR_CODE_LENGTH) return false;
  for (let i = 0; i < code.length; i++) {
    if (PAIR_CODE_ALPHABET.indexOf(code.charAt(i)) === -1) return false;
  }
  return true;
}

/** Affichage "ABC DEF" pour la lisibilité sur TV. */
export function formatPairCode(code: string): string {
  return code.slice(0, 3) + ' ' + code.slice(3);
}
