import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

/**
 * Lance les deux apps en dev, avec une base PGlite jetable et le KV mémoire.
 * Navigateur : Chrome installé (channel) pour éviter un téléchargement ;
 * en CI, `npx playwright install chromium` et retirer `channel`.
 */
const pgliteDir = path.join(os.tmpdir(), 'oria-e2e-' + Date.now());

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  workers: 1,
  use: {
    channel: process.env.CI ? undefined : 'chrome',
    // Fenêtre type navigateur TV.
    viewport: { width: 1280, height: 720 },
  },
  webServer: [
    {
      command: 'pnpm --filter @iptv/web dev',
      url: 'http://localhost:3000/legal/terms',
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        E2E_TEST_MODE: '1',
        PGLITE_DIR: pgliteDir,
        AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        TV_APP_ORIGINS: 'http://localhost:5173',
        // Le faux serveur IPTV est sur localhost.
        ALLOW_PRIVATE_SOURCES: '1',
      },
    },
    {
      command: 'node mock-iptv.mjs',
      url: 'http://localhost:4010/player_api.php',
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @iptv/tv dev',
      url: 'http://localhost:5173',
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
