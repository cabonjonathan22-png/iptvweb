import { expect, test } from '@playwright/test';
import { pair, WEB } from './helpers';

/** Oria TV dans un navigateur de PC : souris, molette, boutons à l'écran. */
test('PC : molette, clic, boutons du lecteur', async ({ browser }) => {
  test.setTimeout(150_000);
  const web = await (await browser.newContext()).newPage();
  const pc = await (await browser.newContext()).newPage();
  const email = 'pointer@example.com';

  await web.request.post(WEB + '/api/test/session', { data: { email } });
  await web.goto(WEB + '/playlists/new');
  await web.getByLabel('Adresse du serveur').fill('localhost:4010');
  await web.getByLabel('Identifiant').fill('demo');
  await web.getByLabel('Mot de passe').fill('demo');
  await web.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(web.getByText('À jour')).toBeVisible({ timeout: 90_000 });

  await pair(pc, web, 'PC', email);
  await expect(pc.locator('html')).toHaveClass(/device-desktop/);

  // Clic sur le menu, molette dans la liste.
  await pc.locator('.home-menu').getByText('TV en direct').click();
  await expect(pc.locator('.col-channels .is-focused .ch-name')).toHaveText('Chaîne 1', { timeout: 15_000 });
  await pc.locator('.col-channels .vl').hover();
  await pc.mouse.wheel(0, 240);
  await expect(pc.locator('.col-channels .is-focused .ch-name')).toHaveText('Chaîne 4');

  // Clic sur une chaîne : plein écran, avec les boutons à l'écran.
  await pc.locator('.col-channels .is-focused').click();
  await expect(pc.locator('.player-title')).toContainText('Chaîne 4');
  await pc.getByRole('button', { name: '▲ Chaîne' }).click();
  await expect(pc.locator('.player-title')).toContainText('Chaîne 5');
  await pc.getByRole('button', { name: '← Retour' }).click();
  await expect(pc.locator('.player-ui')).toHaveCount(0);

  // L'indication « Retour » de l'en-tête est cliquable.
  await pc.locator('.hint-back').click();
  await expect(pc.locator('.crumb')).toHaveText('Accueil');
});
