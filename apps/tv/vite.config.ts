import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import legacy from '@vitejs/plugin-legacy';

/**
 * Cibles : navigateurs TV anciens (VIDAA U5/U6 ≈ Chromium 53-70+, vieux WebKit).
 * On ne génère QUE le bundle legacy (SystemJS + polyfills core-js à l'usage) :
 * certaines TV annoncent le support des modules ES mais échouent sur des
 * syntaxes plus récentes. Un seul bundle = un seul comportement à tester.
 */
export default defineConfig({
  plugins: [
    preact(),
    legacy({
      targets: ['chrome >= 53', 'safari >= 9', 'firefox >= 52'],
      renderModernChunks: false,
    }),
  ],
  build: {
    cssTarget: 'chrome53',
    assetsInlineLimit: 4096,
    reportCompressedSize: true,
  },
  server: { host: true },
});
