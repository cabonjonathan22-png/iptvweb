import { devices, expect, test, type Page } from '@playwright/test';
import { pair, TV, WEB } from './helpers';

const PHONE = { ...devices['Pixel 7'], defaultBrowserType: undefined };

const video = (page: Page) =>
  page.evaluate(() => {
    const v = document.querySelector('video')!;
    return { time: v.currentTime, paused: v.paused, width: v.videoWidth };
  });

/**
 * MKV lu de bout en bout (conversion par le proxy, ffmpeg réel). Lancé seulement avec
 * MOCK_MKV (fichier H.264 de 2 min, deux pistes AC3), FFMPEG_PATH et FFPROBE_PATH.
 */
test.skip(!process.env.MOCK_MKV, 'MOCK_MKV non défini');

test('MKV : lecture, avance rapide et piste audio, sur TV et téléphone', async ({ browser }) => {
  test.setTimeout(300_000);
  const email = 'mkv@example.com';
  const web = await (await browser.newContext()).newPage();
  await web.request.post(WEB + '/api/test/session', { data: { email } });
  await web.goto(WEB + '/playlists/new');
  await web.getByLabel('Adresse du serveur').fill('localhost:4010');
  await web.getByLabel('Identifiant').fill('demo');
  await web.getByLabel('Mot de passe').fill('demo');
  await web.getByRole('button', { name: 'Ajouter la playlist' }).click();
  await expect(web.getByText('À jour')).toBeVisible({ timeout: 90_000 });

  const tv = await (await browser.newContext()).newPage();
  await pair(tv, web, 'TV salon', email);
  const token = (await tv.evaluate(() => localStorage.getItem('oria.token')))!;
  const headers = { Authorization: 'Bearer ' + token };

  // Une fiche sur trois du faux catalogue est un MKV ; la 3e de la liste en est un.
  const list = (await (await tv.request.get(WEB + '/api/tv/vod?category=all&offset=0&limit=3', { headers })).json()) as { items: { id: number }[] };
  const film = list.items[2]!.id;
  const detail = (await (await tv.request.get(WEB + '/api/tv/vod/' + film, { headers })).json()) as { containerExt: string };
  expect(detail.containerExt).toBe('mkv');
  const r = (await (await tv.request.get(`${WEB}/api/tv/play?kind=vod&id=${film}`, { headers })).json()) as { type: string; remux?: unknown };
  expect(r.type).toBe('hls');
  expect(r.remux).toBeTruthy();

  /* ------------------------------------------------------------ Scène TV */
  // Un geste sur la page : un navigateur de PC refuse sinon la lecture automatique.
  await tv.keyboard.press('ArrowDown');
  const tvId = ((await (await tv.request.get(WEB + '/api/tv/me', { headers })).json()) as { device: { id: string } }).device.id;
  await tv.request.post(WEB + '/api/tv/remote', { headers, data: { deviceId: tvId, command: { type: 'vod', id: film, startAt: 0 } } });
  await expect(tv.locator('.player-title')).toBeVisible({ timeout: 20_000 });

  await expect.poll(async () => (await video(tv)).time, { timeout: 90_000, intervals: [1000] }).toBeGreaterThan(2);
  expect((await video(tv)).width).toBeGreaterThan(0);
  // Durée du fichier entier, pas du morceau déjà converti.
  await tv.keyboard.press('ArrowUp');
  await expect(tv.locator('.vod-time').last()).toHaveText('2:00');

  // Saut loin devant : le proxy repart de là, et la position affichée suit.
  await tv.evaluate(() => {
    document.querySelector('.vod-seek')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0 }));
  });
  for (let i = 0; i < 9; i++) await tv.keyboard.press('ArrowRight');
  await expect
    .poll(async () => {
      await tv.keyboard.press('ArrowUp');
      const t = (await tv.locator('.vod-time').first().innerText()).split(':');
      const v = await video(tv);
      return Number(t[0]) * 60 + Number(t[1]) >= 40 && !v.paused && v.width > 0;
    }, { timeout: 90_000, intervals: [2000] })
    .toBe(true);
  // La lecture continue après le saut.
  const t1 = (await video(tv)).time;
  await expect.poll(async () => (await video(tv)).time, { timeout: 30_000, intervals: [1000] }).toBeGreaterThan(t1 + 1);

  await tv.keyboard.press('Escape');
  await expect(tv.locator('.player-ui')).toHaveCount(0, { timeout: 10_000 });

  /* ------------------------------------------------------------- Téléphone */
  const phoneCtx = await browser.newContext(PHONE);
  await phoneCtx.addInitScript((t) => localStorage.setItem('oria.token', t as string), token);
  const tel = await phoneCtx.newPage();
  await tel.goto(TV);
  const tabs = tel.getByRole('navigation', { name: 'Navigation principale' });
  await tabs.getByRole('button', { name: 'Films' }).tap({ timeout: 20_000 });
  await tel.locator('.m-win .m-poster').nth(2).tap({ timeout: 20_000 });
  await tel.getByRole('button', { name: /Lecture|Reprendre/ }).tap({ timeout: 20_000 });
  await expect.poll(async () => (await video(tel)).time, { timeout: 90_000, intervals: [1000] }).toBeGreaterThan(1);

  // Deux pistes annoncées, changement de langue : la lecture repart.
  if (!(await tel.locator('.m-stage.is-shown').count())) await tel.locator('.m-stage').tap({ position: { x: 200, y: 20 } });
  await tel.getByRole('button', { name: 'Pistes' }).tap();
  const tracks = tel.getByRole('dialog', { name: 'Pistes' });
  await expect(tracks.getByRole('button', { name: 'FRE' })).toBeVisible();
  await tracks.getByRole('button', { name: 'ENG' }).tap();
  await tracks.getByRole('button', { name: 'Fermer' }).tap();
  await expect.poll(async () => {
    const v = await video(tel);
    return !v.paused && v.time > 0.5;
  }, { timeout: 60_000, intervals: [1000] }).toBe(true);
});
