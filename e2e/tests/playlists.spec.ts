import { expect, test, type Page } from '@playwright/test';
import { generateM3u } from '../../packages/shared/src/fixtures.ts';

const WEB = 'http://localhost:3000';
const MOCK = 'http://localhost:4010';

async function login(page: Page, email: string) {
  const res = await page.request.post(WEB + '/api/test/session', { data: { email } });
  expect(res.ok()).toBeTruthy();
}

async function openNew(page: Page, tab: 'Xtream Codes' | 'Lien M3U' | 'Fichier M3U') {
  await page.goto(WEB + '/playlists/new');
  await page.getByRole('tab', { name: new RegExp(tab) }).click();
}

test('Xtream : vérification du compte, synchro, catégories, aperçu', async ({ page }) => {
  await login(page, 'xtream@example.com');

  await openNew(page, 'Xtream Codes');
  await page.getByLabel('Nom').fill('Démo Xtream');
  await page.getByLabel('Adresse du serveur').fill('localhost:4010');
  await page.getByLabel('Identifiant').fill('demo');
  await page.getByLabel('Mot de passe').fill('mauvais');
  await page.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(page.locator('p[role=alert]')).toContainText('refusé');

  await page.getByLabel('Mot de passe').fill('demo');
  await page.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(page.getByRole('heading', { name: 'Démo Xtream' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('À jour')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('dd').filter({ hasText: /^3\s?000$/ })).toHaveCount(2);

  // Masquer une catégorie puis la réafficher.
  const row = page.locator('li').filter({ has: page.locator('input[value="Live 1"]') });
  await row.getByRole('button', { name: 'Masquer' }).click();
  await expect(row.getByRole('button', { name: 'Afficher' })).toBeVisible();
  await row.getByRole('button', { name: 'Afficher' }).click();
  await expect(row.getByRole('button', { name: 'Masquer' })).toBeVisible();

  // Recherche dans l'aperçu.
  await page.getByRole('link', { name: 'Aperçu' }).click();
  await page.waitForURL(/tab=preview/);
  await page.getByRole('link', { name: 'Films' }).click();
  await page.waitForURL(/kind=vod/);
  await page.getByLabel('Rechercher').fill('Film 2999');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByText(/^Film 2999 \(/)).toBeVisible();
  await expect(page.locator('ul li')).toHaveCount(1);
});

test('M3U : upload de fichier compressé, erreur lisible sur une page HTML', async ({ page }) => {
  await login(page, 'm3u@example.com');

  await openNew(page, 'Fichier M3U');
  await page.getByLabel('Nom').fill('Fichier');
  await page.getByLabel('Fichier .m3u / .m3u8').setInputFiles({
    name: 'liste.m3u',
    mimeType: 'audio/x-mpegurl',
    buffer: Buffer.from(generateM3u({ count: 2000 })),
  });
  await page.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(page.getByRole('heading', { name: 'Fichier' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('À jour')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('dd').filter({ hasText: /^1\s?200$/ })).toBeVisible();

  await openNew(page, 'Lien M3U');
  await page.getByLabel('Nom').fill('Page web');
  await page.getByLabel('URL de la playlist').fill(MOCK + '/html');
  await page.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(page.locator('p[role=alert]')).toContainText('page web', { timeout: 60_000 });
});
