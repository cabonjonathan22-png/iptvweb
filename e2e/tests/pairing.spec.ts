import { expect, test, type Page } from '@playwright/test';

const TV = 'http://localhost:5173/';
const WEB = 'http://localhost:3000';

async function readCode(tv: Page): Promise<string> {
  const chars = tv.locator('.pair-char:not(.skeleton)');
  await expect(chars).toHaveCount(6, { timeout: 30_000 });
  return (await chars.allTextContents()).join('');
}

/** Lie la TV ouverte dans `tv` à un compte de test, via le dashboard. */
async function pair(tv: Page, web: Page, name: string) {
  await tv.goto(TV);
  const code = await readCode(tv);

  const res = await web.request.post(WEB + '/api/test/session', { data: { email: 'e2e@example.com' } });
  expect(res.ok()).toBeTruthy();
  await web.goto(WEB + '/link?code=' + code);
  await web.getByLabel('Nom de la TV').fill(name);
  await web.getByRole('button', { name: 'Lier cette TV' }).click();
  await expect(web.getByRole('status')).toContainText(name);

  // La TV détecte la liaison par polling (3 s) et ouvre l'accueil.
  await expect(tv.locator('.crumb')).toHaveText('Accueil', { timeout: 15_000 });
  await expect(tv.locator('.eyebrow')).toHaveText(name);
}

const focusedText = (tv: Page) => tv.locator('.is-focused').innerText();

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
