# Oria — lecteur IPTV pour Smart TV (nom provisoire)

Lecteur IPTV web pilotable à la télécommande, pensé d'abord pour les Hisense VIDAA (U5, U6 et suivantes), avec un dashboard web pour gérer comptes, TV et playlists.

> **Oria ne fournit aucun contenu.** C'est un lecteur : chaque utilisateur ajoute ses propres sources et doit disposer des droits nécessaires.

| App | Rôle | Stack | Domaine |
|-----|------|-------|---------|
| `apps/web` | Dashboard + API | Next.js 16, Tailwind 4, Drizzle, Auth.js | `app.mondomaine.com` |
| `apps/tv` | App TV | Vite 7, Preact, bundle legacy | `tv.mondomaine.com` |
| `apps/stream-proxy` | Proxy de flux (étape 3) | Node + Docker, sur un VPS | `stream.mondomaine.com` |
| `packages/shared` | Types, client API, parseurs | TypeScript | — |

L'avancement et l'architecture détaillée sont dans [PLAN.md](PLAN.md).

---

## Démarrage local (aucun service externe requis)

Prérequis : Node ≥ 20.19 et pnpm.

```bash
pnpm install
cp .env.example apps/web/.env.local   # puis renseigner au minimum AUTH_SECRET
pnpm dev:web                          # http://localhost:3000
pnpm dev:tv                           # http://localhost:5173
```

En dev :
- **Base de données** : sans `DATABASE_URL`, une base PGlite (Postgres en WASM) est créée dans `apps/web/.data/` et migrée automatiquement.
- **Redis** : sans variables Upstash, les codes de pairing et le rate limiting sont stockés en mémoire.
- **Connexion** : sans `AUTH_RESEND_KEY`, le lien magique s'affiche dans le terminal de `pnpm dev:web`.

### Mode « TV » sur desktop

L'app TV se pilote entièrement au clavier : flèches, Entrée (OK), Échap ou Retour arrière (Retour), Page↑/Page↓ (CH+/CH-), chiffres.

| Paramètre d'URL | Effet |
|---|---|
| `?tv=1` | Rend l'app dans un cadre 1280×720, la résolution que rapportent la plupart des navigateurs TV |
| `?slow=1` | Simule une TV bas de gamme : +1,2 s de latence réseau et CPU bridé (~20 ms bloqués par frame) |
| `?hlsjs=1` | Ignore le HLS natif du navigateur (Chrome récent, Safari) et force hls.js, comme sur la plupart des TV |

**Touches du lecteur (direct)** : ▲/▼ ou CH+/CH- pour zapper, chiffres pour aller à une chaîne, touche verte pour la dernière chaîne, touche jaune pour les pistes audio et sous-titres, OK ou toute touche pour afficher les infos, Retour pour revenir à la liste.

Les flags restent actifs pour la session. Exemple : `http://localhost:5173/?tv=1&slow=1`.

### Faux serveur IPTV et proxy de flux (dev)

Pour tester sans vraie source :

```bash
pnpm dev:mock                     # faux serveur IPTV : http://localhost:4010
# proxy de flux : créer apps/stream-proxy/.env avec
#   STREAM_PROXY_SECRET=dev-stream-secret-0123456789
#   PUBLIC_URL=http://localhost:8080
#   ALLOW_PRIVATE_UPSTREAMS=1
pnpm dev:proxy                    # http://localhost:8080
```

Dans `apps/web/.env.local`, ajoutez `STREAM_PROXY_URL=http://localhost:8080` et le même `STREAM_PROXY_SECRET`. Sans proxy, les URL sont renvoyées directement à la TV : cela marche en dev (page en http), pas en production.

Une chaîne sur trois du faux serveur redirige vers un flux HLS de test public (Mux, connexion Internet requise), une sur trois est « hors ligne » pour voir l'écran d'erreur.

Ajoutez ensuite `ALLOW_PRIVATE_SOURCES=1` dans `apps/web/.env.local`, puis dans le dashboard :
- **Xtream** : serveur `localhost:4010`, identifiant `demo`, mot de passe `demo` (3 000 chaînes, 3 000 films, 300 séries ; taille via `MOCK_XTREAM_N`) ;
- **M3U** : `http://localhost:4010/playlist.m3u?n=50000`.

> En dev, PGlite tourne dans le même process que Next : pendant une grosse synchro, le dashboard peut ralentir. En production, la synchro tourne dans sa propre invocation avec un vrai Postgres.

### Tests

```bash
pnpm test        # unitaires (vitest)
pnpm typecheck
pnpm test:e2e    # Playwright : lance les deux apps avec une base jetable
```

En local, l'e2e utilise le Chrome installé sur la machine. En CI, lancez `npx playwright install chromium` (le `channel` est désactivé quand `CI` est défini).

---

## Variables d'environnement

Toutes les variables sont documentées dans [.env.example](.env.example). Minimum pour la production :

| Variable | Projet | Rôle |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | web | URL publique du dashboard (QR code, liens) |
| `TV_APP_ORIGINS` | web | Origine(s) de l'app TV autorisées en CORS |
| `DATABASE_URL` | web | Postgres (URL pooled Neon) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | web | Codes de pairing + rate limiting |
| `AUTH_SECRET` | web | Secret Auth.js |
| `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` | web | Envoi des liens magiques |
| `AUTH_GOOGLE_ID` / `_SECRET` | web | Optionnel : connexion Google |
| `CREDENTIALS_ENCRYPTION_KEY` | web | Clé AES-256-GCM (32 octets, base64) des identifiants Xtream |
| `CRON_SECRET` | web | Protège le cron de synchro et les relances internes des jobs |
| `STREAM_PROXY_URL`, `STREAM_PROXY_SECRET` | web + proxy | Proxy de flux (indispensable en production) |
| `VITE_API_URL` | tv | URL du dashboard/API |

---

## Déploiement sur Vercel (deux projets)

1. **Base et Redis** : créez une base Neon (ou Vercel Postgres) et une base Upstash Redis, depuis le Marketplace Vercel ou directement.
2. **Projet « web »** : importez le dépôt, *Root Directory* = `apps/web`, puis renseignez les variables ci-dessus. Le build (`apps/web/vercel.json`) applique les migrations Drizzle avant `next build`.
3. **Projet « tv »** : importez le même dépôt, *Root Directory* = `apps/tv`, puis définissez `VITE_API_URL`. `apps/tv/vercel.json` configure le fallback SPA et met en cache immutable les assets hashés.
4. **Domaines** : ajoutez `app.mondomaine.com` au projet web et `tv.mondomaine.com` au projet tv (enregistrement CNAME vers `cname.vercel-dns.com`). Mettez ensuite à jour `NEXT_PUBLIC_APP_URL`, `TV_APP_ORIGINS` et `VITE_API_URL`.
5. **Google OAuth** (si utilisé) : URI de redirection `https://app.mondomaine.com/api/auth/callback/google`.

**Synchronisation automatique** : `apps/web/vercel.json` déclare un Vercel Cron toutes les 12 h (`/api/cron/sync`). Il resynchronise les playlists et reprend les jobs interrompus.

> Le plan Vercel **Hobby** limite les crons à une exécution par jour. En Hobby, le cron ne tournera donc qu'une fois par jour : passez en Pro pour le rythme de 12 h, ou appelez `/api/cron/sync` depuis un planificateur externe avec l'en-tête `Authorization: Bearer $CRON_SECRET`.

La durée des fonctions est fixée à 300 s (`maxDuration`). Les grosses playlists sont découpées automatiquement en plusieurs invocations.

### Proxy de flux (VPS)

Les flux IPTV sont presque toujours en `http://` et sans CORS. Une page HTTPS (Vercel) ne peut pas les lire, et les fonctions Vercel ne doivent pas relayer de vidéo (durée et bande passante). Le proxy `apps/stream-proxy` est un petit serveur Node sans dépendance, à héberger sur n'importe quel VPS (1 vCPU / 1 Go suffit pour quelques flux simultanés ; c'est la bande passante qui compte).

1. **DNS** : `stream.mondomaine.com` → IP du VPS.
2. **Sur le VPS** (Docker installé), copiez au minimum `apps/stream-proxy/` et `packages/shared/src/` (ou clonez le dépôt), puis :
   ```bash
   cd apps/stream-proxy
   cp .env.example .env     # DOMAIN, PUBLIC_URL, STREAM_PROXY_SECRET
   docker compose up -d --build
   ```
   Caddy obtient le certificat HTTPS automatiquement (ports 80 et 443 ouverts).
3. **Sur Vercel** (projet web) : `STREAM_PROXY_URL=https://stream.mondomaine.com` et le **même** `STREAM_PROXY_SECRET`.
4. **Vérifier** : `curl https://stream.mondomaine.com/health` doit répondre `ok`, puis le bouton « Tester » de l'aperçu d'une playlist doit afficher « Lecture OK (… via le proxy de flux) ».

Le proxy n'accepte que des jetons chiffrés émis par l'API (12 h pour une lecture, 6 h pour les segments). Ce n'est pas un proxy ouvert. Il refuse les adresses réseau privées, y compris après redirection.

---

## Tester sur une Hisense VIDAA

1. Sur la TV : **Home** → **Navigateur** (ou « Browser » dans les applications).
2. Saisissez `tv.mondomaine.com`. En test local, utilisez l'IP de votre PC, par exemple `http://192.168.1.20:5173`, avec `VITE_API_URL=http://192.168.1.20:3000` et `TV_APP_ORIGINS` adapté. Les deux serveurs de dev écoutent sur le réseau local.
3. Ajoutez la page en favori. Sur les VIDAA récentes, vous pouvez aussi l'**épingler à l'écran d'accueil** depuis le menu du navigateur (« Ajouter à l'accueil » / « Add to Home »).
4. L'écran de pairing s'affiche : scannez le QR code avec votre téléphone ou allez sur `app.mondomaine.com/link`, puis saisissez le code.
5. **Calibrer la télécommande** : appuyez sur ↑ ↑ ↓ ↓ ← → ← →, ou passez par Réglages → Debug touches. Chaque touche affiche son `keyCode` et son `key`. Ajoutez les codes manquants dans [apps/tv/src/nav/keys.ts](apps/tv/src/nav/keys.ts), le seul fichier de mapping. Sur cet écran, appuyez deux fois sur Retour pour quitter.

---

## Fonctionnement du pairing

```
TV                                   API (app.*)                       Dashboard
│ POST /api/devices/pair/start ───▶  code + secret (Redis, TTL 10 min)
│ ◀── code, secret, QR SVG
│ GET  /api/devices/pair/status ──▶  (toutes les 3 s, en-tête X-Pairing-Secret)
│                                     ◀── server action linkDevice ─── code + nom
│                                     crée le device (token hashé SHA-256)
│ ◀── { status: linked, token }      token livré une seule fois
│ localStorage ← token ; requêtes suivantes : Authorization: Bearer dvc_…
```

- Rate limiting : 6 codes/min/IP, 60 polls/min/IP, 10 saisies/10 min/utilisateur.

## Fonctionnement de la synchronisation

```
Dashboard ─ ajout / « Synchroniser » ─▶ startSync() : job (génération N+1)
                                        │
            POST /api/sync/run ◀────────┘ (répond 202, travaille dans after())
                 │  prend le bail du job, reprend la phase au curseur
                 │  télécharge en flux → parse → upsert par lots de 1000
                 │  checkpoint (curseur) après chaque lot
                 ├─ temps écoulé ? → rend le bail, se relance (POST /api/sync/run)
                 └─ fini → purge des lignes de génération < N, compteurs, statut « À jour »
Cron 12 h ──▶ /api/cron/sync : playlists à rafraîchir + jobs abandonnés
```

- **Classification M3U** : chemins Xtream `/live/ /movie/ /series/`, puis extension vidéo + motif `S01E02`, puis mots-clés du `group-title`.
- **Xtream** : les épisodes (`get_series_info`) et les fiches détaillées (`get_vod_info`) sont chargés à la demande par la TV (étapes 4 et 5).
- **Personnalisation** : nom, ordre, masquage et verrouillage des catégories sont conservés d'une synchro à l'autre.
- Révocation depuis le dashboard : le device est supprimé. Au prochain appel, la TV reçoit un 401 et revient à l'écran de pairing.
