import { expect, test } from '@playwright/test';
import { pair, WEB } from './helpers';

/**
 * TV en direct, à la télécommande (clavier). Ne dépend pas d'Internet : on
 * vérifie l'interface (listes, plein écran, zapping, numéros, erreurs) et non
 * le décodage vidéo. Les flux du faux serveur : id % 3 === 1 -> hors ligne.
 */
test('direct : listes, plein écran, zapping, numéro, erreur, retour', async ({ browser }) => {
  test.setTimeout(150_000);
  const web = await (await browser.newContext()).newPage();
  const tv = await (await browser.newContext()).newPage();

  // Playlist Xtream de démo, assignée automatiquement à la TV liée ensuite.
  const email = 'live@example.com';
  await web.request.post(WEB + '/api/test/session', { data: { email } });
  await web.goto(WEB + '/playlists/new');
  await web.getByLabel('Adresse du serveur').fill('localhost:4010');
  await web.getByLabel('Identifiant').fill('demo');
  await web.getByLabel('Mot de passe').fill('demo');
  await web.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(web.getByText('À jour')).toBeVisible({ timeout: 60_000 });

  await pair(tv, web, 'TV live', email);
  await expect(tv.locator('.is-focused')).toHaveText('TV en direct');
  await tv.keyboard.press('Enter');

  // Catégories + chaînes paginées ; le focus démarre sur les chaînes.
  await expect(tv.locator('.crumb')).toHaveText('TV en direct');
  await expect(tv.locator('.col-cats .cat-row').first()).toContainText('Toutes les chaînes');
  await expect(tv.locator('.col-channels .is-focused .ch-name')).toHaveText('Chaîne 1', { timeout: 15_000 });
  // Virtualisation : quelques dizaines de lignes au plus dans le DOM pour 3 000 chaînes.
  expect(await tv.locator('.vl-row').count()).toBeLessThan(60);

  // Défilement rapide : les pages suivantes se chargent à la demande.
  for (let i = 0; i < 120; i++) await tv.keyboard.press('ArrowDown');
  await expect(tv.locator('.col-channels .is-focused .ch-name')).toHaveText('Chaîne 121', { timeout: 15_000 });
  for (let i = 0; i < 119; i++) await tv.keyboard.press('ArrowUp');
  await expect(tv.locator('.col-channels .is-focused .ch-name')).toHaveText('Chaîne 2');

  // Plein écran + overlay.
  await tv.keyboard.press('Enter');
  await expect(tv.locator('.player-title')).toContainText('Chaîne 2');
  // Zapping : CH+ (PageUp) puis flèche bas.
  await tv.keyboard.press('PageUp');
  await expect(tv.locator('.player-title')).toContainText('Chaîne 3');
  await tv.keyboard.press('ArrowDown');
  await expect(tv.locator('.player-title')).toContainText('Chaîne 2');

  // Saisie directe d'un numéro.
  await tv.keyboard.press('4');
  await tv.keyboard.press('2');
  await expect(tv.locator('.osd-number')).toContainText('42');
  await expect(tv.locator('.player-title')).toContainText('Chaîne 42', { timeout: 10_000 });
  await tv.keyboard.press('9');
  await tv.keyboard.press('9');
  await tv.keyboard.press('9');
  await tv.keyboard.press('9');
  await expect(tv.locator('.osd-notice')).toContainText('Aucune chaîne n°9999', { timeout: 10_000 });

  // Dernière chaîne : touche verte (keyCode 404), absente d'un clavier, donc émulée.
  await tv.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 404 } as KeyboardEventInit)));
  await expect(tv.locator('.player-title')).toContainText('Chaîne 2');

  // Chaîne hors ligne (n°1) : reconnexions visibles puis écran d'erreur avec « Réessayer ».
  await tv.keyboard.press('1');
  await expect(tv.locator('.player-title')).toContainText('Chaîne 1', { timeout: 10_000 });
  await expect(tv.locator('.player-error')).toContainText('ne répond pas', { timeout: 40_000 });
  await expect(tv.locator('.player-error .is-focused')).toHaveText('Réessayer');

  // Retour : plein écran -> liste -> accueil (lecture arrêtée).
  await tv.keyboard.press('Escape');
  await expect(tv.locator('.player-ui')).toHaveCount(0);
  await expect(tv.locator('.col-channels')).toBeVisible();
  await tv.keyboard.press('Escape');
  await expect(tv.locator('.crumb')).toHaveText('Accueil');
  expect(await tv.evaluate(() => document.querySelector('#video-layer video')!.hasAttribute('src'))).toBe(false);
});
