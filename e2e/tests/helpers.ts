import { expect, type Page } from '@playwright/test';

export const TV = 'http://localhost:5173/';
export const WEB = 'http://localhost:3000';

export async function login(page: Page, email: string) {
  const res = await page.request.post(WEB + '/api/test/session', { data: { email } });
  expect(res.ok()).toBeTruthy();
}

export async function readCode(tv: Page): Promise<string> {
  const chars = tv.locator('.pair-char:not(.skeleton)');
  await expect(chars).toHaveCount(6, { timeout: 30_000 });
  return (await chars.allTextContents()).join('');
}

/** Lie la TV ouverte dans `tv` au compte `email`, via le dashboard ouvert dans `web`. */
export async function pair(tv: Page, web: Page, name: string, email = 'e2e@example.com') {
  await tv.goto(TV);
  const code = await readCode(tv);
  await login(web, email);
  await web.goto(WEB + '/link?code=' + code);
  await web.getByLabel('Nom de la TV').fill(name);
  await web.getByRole('button', { name: 'Lier cette TV' }).click();
  await expect(web.getByRole('status')).toContainText(name);
  // La TV détecte la liaison par polling (3 s) et ouvre l'accueil.
  await expect(tv.locator('.crumb')).toHaveText('Accueil', { timeout: 15_000 });
  await expect(tv.locator('.eyebrow')).toHaveText(name);
}

export const focusedText = (tv: Page) => tv.locator('.is-focused').first().innerText();
