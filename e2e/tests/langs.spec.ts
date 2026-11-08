import { devices, expect, test } from '@playwright/test';
import { TV, WEB } from './helpers';

const IPHONE = { ...devices['iPhone 13'], defaultBrowserType: undefined };

/** Filtre de langues : mêmes réglages et mêmes catégories sur téléphone et dans la scène TV / PC. */
test('filtre de langues du contenu', async ({ browser }) => {
  test.setTimeout(150_000);
  const email = 'langs@example.com';
  const web = await (await browser.newContext()).newPage();
  await web.request.post(WEB + '/api/test/session', { data: { email } });
  await web.goto(WEB + '/playlists/new');
  await web.getByLabel('Adresse du serveur').fill('localhost:4010');
  await web.getByLabel('Identifiant').fill('langs');
  await web.getByLabel('Mot de passe').fill('demo');
  await web.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(web.getByText('À jour')).toBeVisible({ timeout: 90_000 });

  const phoneCtx = await browser.newContext(IPHONE);
  const tel = await phoneCtx.newPage();
  await tel.goto(TV);
  const link = tel.getByRole('link', { name: 'Lier cet appareil' });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await web.goto((await link.getAttribute('href'))!);
  await web.getByLabel('Nom de la TV').fill('Téléphone');
  await web.getByRole('button', { name: 'Lier cette TV' }).click();
  await expect(web.getByRole('status')).toContainText('Téléphone', { timeout: 30_000 });

  const tabs = tel.getByRole('navigation', { name: 'Navigation principale' });
  await expect(tabs).toBeVisible({ timeout: 15_000 });

  // Sans filtre : toutes les catégories.
  const categories = async () => {
    await tabs.getByRole('button', { name: 'Direct' }).tap();
    await tel.locator('.m-picker').tap();
    const names = await tel.locator('.m-list-item span:first-child').allTextContents();
    await tel.getByRole('button', { name: 'Fermer' }).tap();
    return names;
  };
  expect(await categories()).toEqual(expect.arrayContaining(['FR | Sport', 'EN | News', 'Documentaires']));

  // Seule la langue française : l'anglais disparaît, le sans-langue reste.
  await tabs.getByRole('button', { name: 'Réglages' }).tap();
  await tel.getByRole('button', { name: /Langues du contenu/ }).tap();
  await tel.getByRole('button', { name: /Français \(\d+\)/ }).tap();
  await expect(tel.getByRole('button', { name: /Français \(\d+\)/ })).toHaveAttribute('aria-pressed', 'true');
  await tel.getByRole('button', { name: 'Fermer' }).tap();
  await expect(tel.getByRole('button', { name: /Langues du contenu/ })).toContainText('FR');
  // L'enregistrement part en arrière-plan.
  await tel.waitForTimeout(800);

  const filtered = await categories();
  expect(filtered).toEqual(expect.arrayContaining(['FR | Sport', 'Documentaires']));
  expect(filtered).not.toContain('EN | News');

  // Recherche : les chaînes des catégories écartées n'apparaissent plus.
  await tabs.getByRole('button', { name: 'Recherche' }).tap();
  await tel.getByLabel('Rechercher').fill('Chaîne 2');
  await expect(tel.locator('.m-ch-name').first()).toBeVisible({ timeout: 10_000 });
  const token = await tel.evaluate(() => localStorage.getItem('oria.token'));
  const all = await tel.request.get(WEB + '/api/tv/live/channels?category=all&offset=0&limit=100', { headers: { Authorization: 'Bearer ' + token } });
  const body = (await all.json()) as { total: number };
  expect(body.total).toBeLessThan(3000);

  // Scène TV / PC : le même réglage est repris par le dialogue.
  const pcCtx = await browser.newContext();
  await pcCtx.addInitScript((t) => localStorage.setItem('oria.token', t as string), token);
  const pc = await pcCtx.newPage();
  await pc.goto(TV);
  await pc.locator('.home-menu').getByText('Réglages').click();
  const entry = pc.getByText(/Contenu : FR/);
  await expect(entry).toBeVisible({ timeout: 15_000 });
  await entry.click();
  await pc.getByText('Toutes', { exact: true }).click();
  await pc.keyboard.press('Escape');
  await expect(pc.getByText('Contenu : toutes les langues')).toBeVisible();
});
