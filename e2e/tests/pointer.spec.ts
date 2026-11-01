import { expect, test } from '@playwright/test';
import { pair, TV, WEB } from './helpers';

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
  await pc.getByRole('button', { name: 'Chaîne suivante' }).click();
  await expect(pc.locator('.player-title')).toContainText('Chaîne 5');
  await pc.getByRole('button', { name: 'Retour', exact: true }).click();
  await expect(pc.locator('.player-ui')).toHaveCount(0);

  // L'indication « Retour » de l'en-tête est cliquable.
  await pc.locator('.hint-back').click();
  await expect(pc.locator('.crumb')).toHaveText('Accueil');

  // Pointeur immobile : le défilement au clavier ne doit pas déclencher de faux survols.
  const token = await pc.evaluate(() => localStorage.getItem('oria.token'));
  await expect(pc.locator('.row-title').first()).toBeVisible({ timeout: 15_000 });
  await pc.locator('.home-menu').getByText('TV en direct').hover();
  await pc.keyboard.press('ArrowDown');
  await pc.waitForTimeout(1000);
  const later = await pc.locator('.is-focused').first().innerText();
  expect(later).not.toBe('TV en direct');
  // Rien ne bouge tout seul ensuite.
  await pc.waitForTimeout(800);
  expect(await pc.locator('.is-focused').first().innerText()).toBe(later);

  // Navigateur de TV avec souris : la molette marche aussi, y compris exprimée en lignes.
  const tvCtx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; VIDAA) AppleWebKit/537.36 Chrome/70.0 Safari/537.36' });
  await tvCtx.addInitScript((t) => localStorage.setItem('oria.token', t as string), token);
  const tv = await tvCtx.newPage();
  await tv.goto(TV);
  await expect(tv.locator('html')).toHaveClass(/device-tv/);
  await tv.locator('.home-menu').getByText('TV en direct').click({ timeout: 15_000 });
  await expect(tv.locator('.col-channels .is-focused .ch-name')).toBeVisible({ timeout: 15_000 });
  const start = Number((await tv.locator('.col-channels .is-focused .ch-name').innerText()).replace(/\D/g, ''));
  await tv.locator('.col-channels .vl').hover();
  await tv.mouse.wheel(0, 120);
  await expect(tv.locator('.col-channels .is-focused .ch-name')).toHaveText('Chaîne ' + (start + 1));
  await tv.waitForTimeout(400);
  await tv.evaluate(() => {
    document.querySelector('.col-channels .vl')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true, cancelable: true }));
  });
  await expect(tv.locator('.col-channels .is-focused .ch-name')).toHaveText('Chaîne ' + (start + 2));
  // Une seule cran : pas de défilement qui continue après coup.
  await tv.waitForTimeout(600);
  await expect(tv.locator('.col-channels .is-focused .ch-name')).toHaveText('Chaîne ' + (start + 2));

  // Navigateur de TV où la télécommande déplace une souris : tout passe par le pointeur, sans touche.
  const hisense = await tvCtx.newPage();
  await hisense.goto(TV);
  await expect(hisense.locator('.home-menu')).toBeVisible({ timeout: 15_000 });
  await expect(hisense.locator('.scroll-arrow').first()).toBeHidden();
  await hisense.locator('.home-menu').getByText('Films').hover();
  await expect(hisense.locator('.scroll-down').first()).toBeVisible();
  await hisense.locator('.home-menu').getByText('Films').click();
  await expect(hisense.locator('.crumb')).toHaveText('Films');
  const grid = hisense.locator('.vgrid');
  await expect(grid.locator('.grid-cell').first()).toBeVisible({ timeout: 15_000 });
  const before = await grid.locator('.vgrid-inner').getAttribute('style');
  await grid.locator('.scroll-down').click();
  await expect.poll(() => grid.locator('.vgrid-inner').getAttribute('style')).not.toBe(before);
  // Le clic sur la flèche n'ouvre pas de film.
  await expect(hisense.locator('.crumb')).toHaveText('Films');

  // Catégories : idem.
  const cats = hisense.locator('.vl').first();
  if (await cats.locator('.scroll-down').count()) {
    const b = await cats.locator('.vl-inner').getAttribute('style');
    await cats.locator('.scroll-down').click();
    await expect.poll(() => cats.locator('.vl-inner').getAttribute('style')).not.toBe(b);
  }
  // Le Retour de l'en-tête reste cliquable.
  await hisense.locator('.hint-back').click();
  await expect(hisense.locator('.crumb')).toHaveText('Accueil');

  // Direct au pointeur : la liste descend, et le lecteur a ses boutons.
  await hisense.locator('.home-menu').getByText('TV en direct').click();
  const list = hisense.locator('.col-channels .vl');
  await expect(list.locator('.ch-name').first()).toBeVisible({ timeout: 15_000 });
  const b2 = await list.locator('.vl-inner').getAttribute('style');
  await list.locator('.scroll-down').click();
  await expect.poll(() => list.locator('.vl-inner').getAttribute('style')).not.toBe(b2);
  await list.locator('.vl-row.is-focused').click();
  await hisense.mouse.move(300, 300);
  await expect(hisense.getByRole('button', { name: 'Retour', exact: true })).toBeVisible();
  await hisense.getByRole('button', { name: 'Retour', exact: true }).click();
  await expect(hisense.locator('.player-ui')).toHaveCount(0);
});
