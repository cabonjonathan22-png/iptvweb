import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@iptv/shared'],
  // PGlite (base locale de dev) embarque du WASM : on le laisse hors bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
};

export default config;
