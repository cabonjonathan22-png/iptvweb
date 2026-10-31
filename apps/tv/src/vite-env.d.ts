/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du dashboard / API, ex. https://app.mondomaine.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
