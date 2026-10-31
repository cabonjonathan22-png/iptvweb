# Plan d'implémentation

## Arborescence cible

```
iptvweb/
├── apps/
│   ├── web/                     Next.js 16 (App Router) : dashboard + toutes les routes /api
│   │   ├── drizzle/             migrations SQL générées (+ 0000 : extension pg_trgm)
│   │   ├── scripts/migrate.ts   migrations sur DATABASE_URL (lancé au build Vercel)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (app)/                 espace connecté : devices, playlists, réglages
│   │       │   ├── link/                  cible du QR code de pairing
│   │       │   ├── login/  legal/terms/
│   │       │   ├── actions/               server actions du dashboard
│   │       │   └── api/
│   │       │       ├── devices/pair/{start,status}   pairing (TV)
│   │       │       ├── tv/*                          API TV (device token, paginée, ETag)
│   │       │       ├── img                           proxy images (cache immutable + resize)
│   │       │       └── cron/*                        resync 12 h, purge EPG
│   │       ├── lib/
│   │       │   ├── db/ (schema, client Postgres | PGlite)
│   │       │   ├── kv.ts  ratelimit.ts  crypto.ts  pairing.ts  device-auth.ts
│   │       │   └── sync/                  jobs de synchro M3U / Xtream / XMLTV (étape 2+)
│   │       └── proxy.ts                   CORS des endpoints TV
│   ├── tv/                      Vite + Preact, SPA legacy (Chromium 53+)
│   │   └── src/
│   │       ├── nav/             keys.ts (mapping unique), focus.ts (nav spatiale), hooks
│   │       ├── lib/             api (XHR), storage, scale 1080p, devflags
│   │       ├── player/          chaîne HLS natif → hls.js → mpegts.js (étape 3)
│   │       ├── components/      Button, Dialog, VirtualList, Poster, Keyboard…
│   │       └── screens/         Pairing, Home, Live, Guide, Movies, Series, Search, Settings, KeyDebug
│   └── stream-proxy/            Node + Dockerfile : réécriture HLS, CORS, UA/Referer (étape 3)
├── packages/shared/             types, client API, parseurs M3U / Xtream / XMLTV
└── e2e/                         Playwright : pairing + navigation clavier
```

## Étapes

| # | Étape | Statut |
|---|-------|--------|
| 0 | Socle monorepo, schéma DB complet, auth, design system TV + dashboard | ✅ |
| 1 | **Pairing** : code + QR, polling 3 s, device token, révocation, rate limiting, écran Debug touches, confirmation de sortie | ✅ |
| 2 | Playlists : M3U (URL, fichier), Xtream (chiffré), parsing streaming en jobs, cron 12 h, statut | ⏳ |
| 3 | Live TV + lecteur + `stream-proxy` (HLS/TS, zapping, overlay, résilience) | |
| 4 | Films (grille virtualisée, fiche, reprise) | |
| 5 | Séries (saisons, épisodes, épisode suivant) | |
| 6 | EPG (XMLTV streaming, grille virtualisée, purge 24 h) | |
| 7 | Recherche globale + clavier virtuel | |
| 8 | Favoris et reprise de lecture | |
| 9 | Réglages et contrôle parental (PIN) | |
| 10 | Polish & performance (budget DOM, mémoire images, mesure démarrage VIDAA) | |

## Décisions techniques

- **Navigation spatiale maison** (`apps/tv/src/nav/focus.ts`, ~3 Ko) plutôt que norigin :
  pas de dépendance React/compat, et prise en charge native des listes virtualisées
  (le nœud focalisé peut consommer les flèches pour défiler par index).
- **Bundle TV legacy uniquement** (`renderModernChunks: false`) : un seul comportement
  sur toutes les TV. Mesuré à l'étape 1 : ~17 Ko gzip d'app + ~35 Ko de polyfills.
- **CSS TV écrit à la main** : Tailwind v4 génère `@layer`, `oklch()`, `gap`…
  incompatibles Chromium 53. Le dashboard, lui, utilise Tailwind.
- **Dev sans service externe** : PGlite (Postgres WASM) si `DATABASE_URL` est vide,
  KV et rate limiting en mémoire si Upstash n'est pas configuré.
- **Sécurité du pairing** : la TV reçoit un secret avec le code ; le token n'est livré
  qu'au porteur du secret, une seule fois. Code et secret inconnus répondent de façon
  identique (pas d'oracle). Verrou anti double confirmation. Token stocké hashé (SHA-256).
- **Identifiants Xtream jamais exposés** : les URL de lecture seront signées et
  résolues par le `stream-proxy` (étape 3), la TV ne voit jamais user/pass.
