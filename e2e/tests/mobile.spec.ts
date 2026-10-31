import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { TV, WEB } from './helpers';

const IPHONE = { ...devices['iPhone 13'], defaultBrowserType: undefined };
const TABLET = { ...devices['Galaxy Tab S4 landscape'], defaultBrowserType: undefined };

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function phone(browser: Browser, options: Parameters<Browser['newContext']>[0], token: string | null) {
  const ctx = await browser.newContext(options);
  if (token) await ctx.addInitScript((t) => localStorage.setItem('oria.token', t as string), token);
  const page = await ctx.newPage();
  await page.goto(TV);
  return page;
}

test('téléphone et tablette : liaison, navigation, filtre de langues, lecteur, installation', async ({ browser }) => {
  test.setTimeout(180_000);
  const email = 'mobile@example.com';

  // Dashboard sur téléphone : pas de débordement, et ajout de la playlist.
  const webCtx = await browser.newContext(IPHONE);
  const web = await webCtx.newPage();
  await web.request.post(WEB + '/api/test/session', { data: { email } });
  await web.goto(WEB + '/playlists/new');
  expect(await noHorizontalScroll(web)).toBe(true);
  await web.getByLabel('Adresse du serveur').fill('localhost:4010');
  await web.getByLabel('Identifiant').fill('demo');
  await web.getByLabel('Mot de passe').fill('demo');
  await web.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(web.getByText('À jour')).toBeVisible({ timeout: 90_000 });
  for (const path of ['/playlists', '/devices', '/settings']) {
    await web.goto(WEB + path);
    expect(await noHorizontalScroll(web), 'débordement sur ' + path).toBe(true);
  }

  // Liaison depuis le téléphone : le code s'affiche, avec un lien direct.
  const tel = await phone(browser, IPHONE, null);
  await expect(tel.locator('html')).toHaveClass(/ui-touch/);
  const link = tel.getByRole('link', { name: 'Lier cet appareil' });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await web.goto((await link.getAttribute('href'))!);
  await web.getByLabel('Nom de la TV').fill('Téléphone');
  await web.getByRole('button', { name: 'Lier cette TV' }).click();
  await expect(web.getByRole('status')).toContainText('Téléphone');
  const tabs = tel.getByRole('navigation', { name: 'Navigation principale' });
  await expect(tabs).toBeVisible({ timeout: 15_000 });
  expect(await noHorizontalScroll(tel)).toBe(true);

  // Direct : liste, retour par le bouton et par l'historique.
  await tabs.getByRole('button', { name: 'Direct' }).tap();
  await expect(tel.locator('.m-ch-name').first()).toContainText('Chaîne 1', { timeout: 15_000 });
  await tel.locator('.m-ch-main').first().tap();
  const stage = tel.locator('.m-stage');
  await expect(stage).toBeVisible();
  await expect(tel.locator('html')).toHaveClass(/m-video-on/);

  // En portrait : vidéo en haut, sur la largeur et en 16:9, avec la liste dessous.
  const box = (await tel.locator('#video-layer').boundingBox())!;
  const vp = tel.viewportSize()!;
  expect(box.width).toBe(vp.width);
  expect(Math.round(box.height)).toBe(Math.round((vp.width * 9) / 16));
  await expect(tel.locator('.m-below .m-ch.is-active')).toContainText('Chaîne 1');

  // Commandes tactiles : zapping.
  if (!(await tel.locator('.m-stage.is-shown').count())) await stage.tap({ position: { x: 20, y: 80 } });
  await tel.getByRole('button', { name: 'Chaîne suivante' }).tap();
  await expect(tel.locator('.m-now h1')).toContainText('Chaîne 2');

  // Paysage : la vidéo prend tout l'écran.
  await tel.setViewportSize({ width: vp.height, height: vp.width });
  const land = (await tel.locator('#video-layer').boundingBox())!;
  expect(land.width).toBe(vp.height);
  expect(land.height).toBe(vp.width);
  await expect(tel.locator('.m-below')).toBeHidden();
  await tel.setViewportSize(vp);

  await tel.goBack();
  await expect(tel.locator('.m-stage')).toHaveCount(0);
  await expect(tel.locator('.m-title')).toHaveText('TV en direct');
  await expect(tel.locator('html')).not.toHaveClass(/m-video-on/);

  // Films : grille, fiche, retour par le bouton de l'en-tête.
  await tabs.getByRole('button', { name: 'Films' }).tap();
  await expect(tel.locator('.m-win .m-poster').first()).toBeVisible({ timeout: 15_000 });
  expect(await noHorizontalScroll(tel)).toBe(true);
  await tel.locator('.m-win .m-poster').first().tap();
  await expect(tel.getByRole('button', { name: /Lecture|Reprendre/ })).toBeVisible();
  await tel.getByRole('button', { name: 'Retour' }).tap();
  await expect(tel.locator('.m-title')).toHaveText('Films');

  // Recherche avec le champ natif.
  await tabs.getByRole('button', { name: 'Recherche' }).tap();
  await tel.getByLabel('Rechercher').fill('Chaîne 1');
  await expect(tel.locator('.m-ch-name').first()).toContainText('Chaîne 1', { timeout: 10_000 });

  // Réglages : le panneau se ferme aussi par le retour système.
  await tabs.getByRole('button', { name: 'Réglages' }).tap();
  await tel.getByRole('button', { name: /Langues du contenu/ }).tap();
  await expect(tel.getByRole('dialog', { name: 'Langues du contenu' })).toBeVisible();
  await expect(tel.getByRole('button', { name: 'Toutes', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await tel.goBack();
  await expect(tel.getByRole('dialog')).toHaveCount(0);
  await expect(tel.locator('.m-title')).toHaveText('Réglages');

  // Installation : instructions sur iPhone, sauf si déjà refusée.
  await tabs.getByRole('button', { name: 'Accueil' }).tap();
  await expect(tel.locator('.m-install')).toBeVisible();
  await tel.locator('.m-install').getByRole('button', { name: 'Installer' }).tap();
  await expect(tel.getByRole('dialog', { name: 'Installer Oria' })).toContainText('Partager');
  await tel.getByRole('button', { name: 'Fermer' }).tap();
  await tel.locator('.m-install').getByRole('button', { name: 'Plus tard' }).tap();
  await expect(tel.locator('.m-install')).toHaveCount(0);

  // Tablette en paysage : même interface, vidéo et liste côte à côte.
  const token = await tel.evaluate(() => localStorage.getItem('oria.token'));
  const tab = await phone(browser, TABLET, token);
  await expect(tab.locator('html')).toHaveClass(/ui-touch/);
  await tab.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Direct' }).tap();
  await tab.locator('.m-ch-main').first().tap({ timeout: 15_000 });
  await expect(tab.locator('.m-stage')).toBeVisible();
  const v = (await tab.locator('#video-layer').boundingBox())!;
  const below = (await tab.locator('.m-below').boundingBox())!;
  expect(below.x).toBeGreaterThanOrEqual(v.width - 1);
  expect(await noHorizontalScroll(tab)).toBe(true);
});
