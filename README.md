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

Les flags restent actifs pour la session. Exemple : `http://localhost:5173/?tv=1&slow=1`.

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
| `VITE_API_URL` | tv | URL du dashboard/API |

---

## Déploiement sur Vercel (deux projets)

1. **Base et Redis** : créez une base Neon (ou Vercel Postgres) et une base Upstash Redis, depuis le Marketplace Vercel ou directement.
2. **Projet « web »** : importez le dépôt, *Root Directory* = `apps/web`, puis renseignez les variables ci-dessus. Le build (`apps/web/vercel.json`) applique les migrations Drizzle avant `next build`.
3. **Projet « tv »** : importez le même dépôt, *Root Directory* = `apps/tv`, puis définissez `VITE_API_URL`. `apps/tv/vercel.json` configure le fallback SPA et met en cache immutable les assets hashés.
4. **Domaines** : ajoutez `app.mondomaine.com` au projet web et `tv.mondomaine.com` au projet tv (enregistrement CNAME vers `cname.vercel-dns.com`). Mettez ensuite à jour `NEXT_PUBLIC_APP_URL`, `TV_APP_ORIGINS` et `VITE_API_URL`.
5. **Google OAuth** (si utilisé) : URI de redirection `https://app.mondomaine.com/api/auth/callback/google`.

Le proxy de flux (`apps/stream-proxy`) arrive à l'étape 3, avec son Dockerfile et sa procédure de déploiement sur VPS.

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
- Révocation depuis le dashboard : le device est supprimé. Au prochain appel, la TV reçoit un 401 et revient à l'écran de pairing.
