import { devices, expect, test } from '@playwright/test';
import { pair, TV, WEB } from './helpers';

const IPHONE = { ...devices['iPhone 13'], defaultBrowserType: undefined };

/** Plusieurs appareils sur un même compte : replay, envoi vers la TV, télécommande, reprise. */
test('replay, envoi vers la TV, télécommande, reprise sur un autre appareil', async ({ browser }) => {
  test.setTimeout(240_000);
  const email = 'remote@example.com';
  const web = await (await browser.newContext()).newPage();
  await web.request.post(WEB + '/api/test/session', { data: { email } });
  await web.goto(WEB + '/playlists/new');
  await web.getByLabel('Adresse du serveur').fill('localhost:4010');
  await web.getByLabel('Identifiant').fill('demo');
  await web.getByLabel('Mot de passe').fill('demo');
  await web.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(web.getByText('À jour')).toBeVisible({ timeout: 90_000 });

  // Une « TV » et un téléphone sur le même compte.
  const tv = await (await browser.newContext()).newPage();
  await pair(tv, web, 'TV salon', email);

  const tel = await (await browser.newContext(IPHONE)).newPage();
  await tel.goto(TV);
  const link = tel.getByRole('link', { name: 'Lier cet appareil' });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await web.goto((await link.getAttribute('href'))!);
  await web.getByLabel('Nom de la TV').fill('Téléphone');
  await web.getByRole('button', { name: 'Lier cette TV' }).click();
  await expect(web.getByRole('status')).toContainText('Téléphone');
  const tabs = tel.getByRole('navigation', { name: 'Navigation principale' });
  await expect(tabs).toBeVisible({ timeout: 15_000 });
  const token = (await tel.evaluate(() => localStorage.getItem('oria.token')))!;
  const headers = { Authorization: 'Bearer ' + token };
  const showControls = async () => {
    if (!(await tel.locator('.m-stage.is-shown').count())) await tel.locator('.m-stage').tap({ position: { x: 5, y: 100 } });
  };

  /* -------------------------------------------------- Replay : API */
  const channels = (await (await tel.request.get(WEB + '/api/tv/live/channels?category=all&offset=0&limit=5', { headers })).json()) as {
    items: { id: number; catchup: boolean }[];
  };
  const withReplay = channels.items.find((c) => c.catchup)!;
  const without = channels.items.find((c) => !c.catchup)!;
  const stop = Date.now() - 60_000;
  const start = stop - 1800_000;
  const play = async (id: number) => tel.request.get(`${WEB}/api/tv/play?kind=catchup&id=${id}&start=${start}&stop=${stop}`, { headers });
  const ok = await play(withReplay.id);
  expect(ok.status()).toBe(200);
  // L'URL exacte est vérifiée par les tests unitaires : ici elle peut passer par le proxy, chiffrée.
  expect(((await ok.json()) as { url: string; live: boolean }).live).toBe(false);
  expect((await play(without.id)).status()).toBe(400);

  /* ------------------------------------- Replay : téléphone (Chaîne 1) */
  await tabs.getByRole('button', { name: 'Direct' }).tap();
  await tel.locator('.m-ch-main').first().tap({ timeout: 15_000 });
  await expect(tel.locator('.m-now h1')).toContainText('Chaîne 1');
  await showControls();
  await tel.getByRole('button', { name: 'Replay', exact: true }).tap();
  const sheet = tel.getByRole('dialog', { name: 'Replay' });
  await expect(sheet.locator('.m-list-item').first()).toBeVisible({ timeout: 10_000 });
  const programme = (await sheet.locator('.m-list-item span').first().innerText()).trim();
  await sheet.locator('.m-list-item').first().tap();
  await expect(tel.locator('.m-ctl-title')).toContainText(programme.split(' · ').pop()!);
  await tel.goBack();
  await expect(tel.locator('.m-now h1')).toContainText('Chaîne 1');

  /* ---------------------------------- Replay : guide sur la TV */
  await tv.locator('.home-menu').getByText('Guide TV').click();
  await expect(tv.locator('.guide-info-ch')).toContainText('Chaîne 1', { timeout: 15_000 });
  await tv.keyboard.press('ArrowLeft');
  await expect(tv.locator('.guide-replay-hint')).toBeVisible();
  await tv.keyboard.press('Enter');
  await expect(tv.locator('.player-title')).toBeVisible();
  await tv.keyboard.press('Escape');
  await expect(tv.locator('.player-ui')).toHaveCount(0);
  await expect(tv.locator('.guide-info-ch')).toBeVisible();
  await tv.keyboard.press('Escape');
  await expect(tv.locator('.crumb')).toHaveText('Accueil');

  /* -------------------------------------- Envoi d'une chaîne vers la TV */
  await showControls();
  await tel.getByRole('button', { name: 'Diffuser' }).tap();
  await tel.getByRole('dialog', { name: 'Diffuser' }).getByRole('button', { name: /TV salon/ }).tap({ timeout: 20_000 });
  await expect(tv.locator('.player-title')).toContainText('Chaîne 1', { timeout: 15_000 });

  /* ------------------------------------------------- Télécommande */
  const remote = tel.getByRole('dialog', { name: 'Lecture sur la TV' });
  await remote.getByRole('button', { name: 'Chaîne suivante' }).tap();
  await expect(tv.locator('.player-title')).toContainText('Chaîne 2', { timeout: 15_000 });
  await remote.getByRole('button', { name: 'Retour', exact: true }).tap();
  await expect(tv.locator('.crumb')).toHaveText('Accueil', { timeout: 15_000 });
  await remote.getByRole('button', { name: 'Fermer' }).tap();
  await tel.goBack();

  /* ---------------------------- Reprise : film commencé sur le téléphone */
  const movies = (await (await tel.request.get(WEB + '/api/tv/vod?category=all&offset=0&limit=1', { headers })).json()) as { items: { id: number; name: string }[] };
  const film = movies.items[0]!;
  const saved = await tel.request.put(WEB + '/api/tv/progress', { headers, data: { kind: 'vod', id: film.id, position: 600, duration: 5400 } });
  expect(saved.ok()).toBe(true);

  await tv.reload();
  const prompt = tv.locator('.dialog');
  await expect(prompt).toContainText('Téléphone', { timeout: 15_000 });
  await expect(prompt).toContainText('10:00');
  await prompt.getByText('Reprendre').click();
  await expect(tv.locator('.player-title')).toContainText(film.name.replace(/ \(\d+\)$/, ''), { timeout: 15_000 });
  await tv.keyboard.press('Escape');

  // Une fois repris ici, le téléphone ne propose rien ; et la TV ne redemande pas.
  await tv.reload();
  await expect(tv.locator('.home-menu')).toBeVisible({ timeout: 15_000 });
  await tv.waitForTimeout(1500);
  await expect(tv.locator('.dialog')).toHaveCount(0);
});
