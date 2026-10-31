import { describe, expect, it } from 'vitest';
import { detectCategoryLang } from './langs';

describe('detectCategoryLang', () => {
  it('reconnaît les préfixes de playlists', () => {
    for (const n of ['FR | Sport', 'FR: Cinéma', '|FR| News', '[FR] Films', 'FR - Enfants', 'VOSTFR Séries', 'FR']) {
      expect(detectCategoryLang(n)).toBe('fr');
    }
    expect(detectCategoryLang('UK | Sports')).toBe('en');
    expect(detectCategoryLang('US Movies')).toBe('en');
    expect(detectCategoryLang('DE: Kino')).toBe('de');
    expect(detectCategoryLang('Sport (ES)')).toBe('es');
    expect(detectCategoryLang('AR | BeIN')).toBe('ar');
  });

  it('reconnaît les noms de pays et de langues', () => {
    expect(detectCategoryLang('France Généraliste')).toBe('fr');
    expect(detectCategoryLang('Chaînes Françaises')).toBe('fr');
    expect(detectCategoryLang('Allemagne')).toBe('de');
    expect(detectCategoryLang('Films Italiens')).toBe('it');
    expect(detectCategoryLang('English Series')).toBe('en');
  });

  it("ne devine pas au hasard : sans indice, pas de langue", () => {
    for (const n of ['Sport', 'Documentaires', "It's Always Sunny", 'Live 1', 'Films 3', 'Action', 'Séries 2']) {
      expect(detectCategoryLang(n)).toBeNull();
    }
  });
});
