import { expect, test, type Page } from '@playwright/test';
import { pair, WEB } from './helpers';

/**
 * Parcours complet hors lecture vidéo (pas de dépendance Internet) :
 * films, séries, EPG, recherche, favoris, contrôle parental, réglages.
 */
const press = async (tv: Page, ...keys: string[]) => {
  for (const k of keys) await tv.keyboard.press(k);
};
/** Touches couleur (absentes d'un clavier) : keyCode HbbTV émulé. */
const color = (tv: Page, keyCode: number) =>
  tv.evaluate((code) => document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code } as KeyboardEventInit)), keyCode);

test('films, séries, EPG, recherche, favoris, parental, réglages', async ({ browser }) => {
  test.setTimeout(240_000);
  const web = await (await browser.newContext()).newPage();
  const tv = await (await browser.newContext()).newPage();
  const email = 'features@example.com';

  // Playlist Xtream de démo (avec guide TV xmltv.php), assignée à la TV.
  await web.request.post(WEB + '/api/test/session', { data: { email } });
  await web.goto(WEB + '/playlists/new');
  await web.getByLabel('Adresse du serveur').fill('localhost:4010');
  await web.getByLabel('Identifiant').fill('demo');
  await web.getByLabel('Mot de passe').fill('demo');
  await web.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(web.getByText('À jour')).toBeVisible({ timeout: 90_000 });
  await expect(web.getByText(/guide TV : 5\s?200 programmes/)).toBeVisible();
  const playlistUrl = web.url();

  await pair(tv, web, 'TV salon', email);

  /* ------------------------------------------------------------ Accueil */
  await expect(tv.locator('.home-menu')).toBeVisible();
  await expect(tv.locator('.row-title')).toContainText(['Films ajoutés récemment', 'Séries'], { timeout: 15_000 });

  /* -------------------------------------------------------------- Films */
  await press(tv, 'ArrowRight', 'ArrowRight', 'Enter');
  await expect(tv.locator('.crumb')).toHaveText('Films');
  await expect(tv.locator('.grid-cell.is-focused')).toBeVisible({ timeout: 15_000 });
  await press(tv, 'Enter');
  await expect(tv.locator('.detail-plot')).toContainText('Synopsis détaillé', { timeout: 15_000 });
  await expect(tv.locator('.detail-credits')).toContainText(['Réalisatrice D', 'Acteur A']);
  await expect(tv.locator('.is-focused')).toHaveText('▶ Lecture');
  await press(tv, 'ArrowRight', 'Enter');
  await expect(tv.locator('.is-focused')).toHaveText('♥ Dans mes favoris');
  await press(tv, 'Escape');
  // Catégorie « Favoris » : le film ajouté y apparaît (on attend le remontage de l'écran).
  await expect(tv.locator('.grid-cell.is-focused')).toBeVisible({ timeout: 15_000 });
  await press(tv, 'ArrowLeft');
  await expect(tv.locator('.col-cats .vl-focused')).toBeVisible();
  await press(tv, 'ArrowDown', 'Enter');
  await expect(tv.locator('.grid-cell')).toHaveCount(1, { timeout: 10_000 });
  await press(tv, 'Escape');

  /* ------------------------------------------------------------- Séries */
  await expect(tv.locator('.crumb')).toHaveText('Accueil');
  await expect(tv.locator('.is-focused')).toHaveText('Films');
  await press(tv, 'ArrowRight', 'Enter');
  await expect(tv.locator('.crumb')).toHaveText('Séries');
  await expect(tv.locator('.grid-cell.is-focused')).toBeVisible({ timeout: 15_000 });
  await press(tv, 'Enter');
  await expect(tv.locator('.ep-title').first()).toContainText('Épisode 1', { timeout: 15_000 });
  await expect(tv.getByText('Saison 2')).toBeVisible();
  await expect(tv.locator('.is-focused')).toContainText('Lecture S1 · E1');
  await press(tv, 'Escape');
  await expect(tv.locator('.grid-cell.is-focused')).toBeVisible({ timeout: 15_000 });
  await press(tv, 'Escape');

  /* ---------------------------------------------- Direct : EPG + favori */
  await expect(tv.locator('.crumb')).toHaveText('Accueil');
  await expect(tv.locator('.is-focused')).toHaveText('Séries');
  await press(tv, 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'Enter');
  await expect(tv.locator('.crumb')).toHaveText('TV en direct');
  await expect(tv.locator('.col-channels .ch-epg').first()).toContainText('Programme', { timeout: 15_000 });
  await expect(tv.locator('.epg-now')).toContainText('Programme');
  await color(tv, 403); // rouge
  await expect(tv.locator('.osd-notice')).toContainText('ajoutée aux favoris');
  await expect(tv.locator('.col-channels .is-focused .ch-fav')).toBeVisible();
  await press(tv, 'Escape');

  /* --------------------------------------------------------------- Guide */
  await expect(tv.locator('.is-focused')).toHaveText('TV en direct');
  await press(tv, 'ArrowRight', 'Enter');
  await expect(tv.locator('.crumb')).toHaveText('Guide TV');
  await expect(tv.locator('.guide-prog.is-focused')).toBeVisible({ timeout: 15_000 });
  await expect(tv.locator('.guide-info-title')).toContainText('Programme');
  await press(tv, 'ArrowRight', 'ArrowDown');
  await expect(tv.locator('.guide-info-ch')).toContainText('Chaîne 2');
  await press(tv, 'Escape');

  /* ----------------------------------------------------------- Recherche */
  await expect(tv.locator('.is-focused')).toHaveText('Guide TV');
  await press(tv, 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter');
  await expect(tv.locator('.crumb')).toHaveText('Recherche');
  await press(tv, '1', '2');
  await expect(tv.locator('.search-results')).toContainText('Chaîne 12', { timeout: 10_000 });
  await expect(tv.locator('.search-results')).toContainText('Film 12');
  await press(tv, 'Escape');

  /* ----------------------------------- Contrôle parental (dashboard -> TV) */
  await web.goto(playlistUrl);
  const row = web.locator('li').filter({ has: web.locator('input[value="Live 1"]') });
  await row.getByRole('button', { name: 'Verrouiller' }).click();
  await expect(row.getByRole('button', { name: 'Verrouillée' })).toBeVisible();
  await web.goto(WEB + '/settings');
  await web.getByLabel('Code (4 chiffres)').fill('1234');
  await web.getByLabel('Confirmation').fill('1234');
  await web.getByRole('button', { name: 'Définir le code' }).click();
  await expect(web.getByText('Code parental enregistré.')).toBeVisible();

  // La TV relit les réglages au retour sur l'accueil.
  await tv.reload();
  await expect(tv.locator('.home-menu')).toBeVisible({ timeout: 15_000 });
  await tv.waitForTimeout(1500); // réglages du compte (hasPin) chargés au démarrage
  await press(tv, 'Enter'); // TV en direct
  await expect(tv.locator('.crumb')).toHaveText('TV en direct');
  await expect(tv.locator('.col-channels .is-focused')).toBeVisible({ timeout: 15_000 });
  await press(tv, 'ArrowLeft');
  await expect(tv.locator('.col-cats .vl-focused')).toBeVisible();
  await press(tv, 'ArrowDown', 'ArrowDown', 'Enter'); // « Live 1 » (verrouillée)
  await expect(tv.locator('.dialog-title')).toHaveText('Code parental');
  await press(tv, '9', '9', '9', '9');
  await expect(tv.locator('.dialog .error-text')).toContainText('incorrect');
  await press(tv, '1', '2', '3', '4');
  await expect(tv.locator('.dialog')).toHaveCount(0, { timeout: 10_000 });
  await expect(tv.locator('.col-channels .ch-name').first()).toContainText('Chaîne 1', { timeout: 10_000 });
  await press(tv, 'Escape');
  await expect(tv.locator('.is-focused')).toHaveText('TV en direct');

  /* --------------------------------------------- Réglages TV -> compte */
  await press(tv, 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter');
  await expect(tv.locator('.crumb')).toHaveText('Réglages');
  await expect(tv.getByText('Contrôle parental : code défini')).toBeVisible();
  await press(tv, 'ArrowDown', 'Enter'); // langue audio -> Français
  await expect(tv.locator('.is-focused')).toHaveText('Langue audio : Français');
  await expect
    .poll(async () => {
      await web.goto(WEB + '/settings');
      return web.getByLabel('Langue audio préférée').inputValue();
    })
    .toBe('fr');
});
