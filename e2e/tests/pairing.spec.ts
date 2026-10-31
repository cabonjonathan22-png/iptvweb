import { expect, test } from '@playwright/test';
import { focusedText, pair, WEB } from './helpers';

test('pairing complet TV <-> dashboard, puis déliaison', async ({ browser }) => {
  const tv = await (await browser.newContext()).newPage();
  const web = await (await browser.newContext()).newPage();
  await pair(tv, web, 'TV salon');

  // Le token survit à un rechargement.
  await tv.reload();
  await expect(tv.locator('.crumb')).toHaveText('Accueil', { timeout: 15_000 });

  // Révocation depuis le dashboard => la TV retourne au pairing au prochain appel API.
  await web.goto(WEB + '/devices');
  web.once('dialog', (d) => d.accept());
  await web.getByRole('button', { name: 'Révoquer' }).first().click();
  await expect(web.getByText('Aucune TV liée')).toBeVisible();
  await tv.keyboard.press('Enter'); // « Actualiser »
  await expect(tv.locator('.pairing-title')).toBeVisible({ timeout: 15_000 });
});

test('navigation clavier : focus, mémoire, Retour, confirmation de sortie, debug', async ({ browser }) => {
  const tv = await (await browser.newContext()).newPage();
  const web = await (await browser.newContext()).newPage();
  await pair(tv, web, 'TV chambre');

  expect(await focusedText(tv)).toBe('Actualiser');
  await tv.keyboard.press('ArrowRight');
  expect(await focusedText(tv)).toBe('Réglages');
  await tv.keyboard.press('Enter');
  await expect(tv.locator('.crumb')).toHaveText('Réglages');

  // Retour : on retrouve le dernier élément focalisé de l'accueil.
  await tv.keyboard.press('Escape');
  await expect(tv.locator('.crumb')).toHaveText('Accueil');
  await expect(tv.locator('.is-focused')).toHaveText('Réglages');

  // Retour sur l'accueil : confirmation, focus par défaut sur « Rester ».
  await tv.keyboard.press('Backspace');
  await expect(tv.locator('.dialog-title')).toHaveText("Quitter l'application ?");
  await expect(tv.locator('.is-focused')).toHaveText('Rester');
  await tv.keyboard.press('Escape');
  await expect(tv.locator('.dialog')).toHaveCount(0);

  // Séquence cachée ↑↑↓↓←→←→ => écran Debug touches.
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight']) {
    await tv.keyboard.press(k);
  }
  await expect(tv.locator('.crumb')).toHaveText('Debug touches');
  await tv.keyboard.press('PageUp');
  await expect(tv.locator('.key-table tbody tr').first()).toContainText('chUp');
});
