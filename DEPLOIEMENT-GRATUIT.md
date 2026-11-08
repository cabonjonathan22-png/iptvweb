# Déploiement 100 % gratuit

| Brique | Service | Offre gratuite | Limite à connaître |
|---|---|---|---|
| Dashboard + API | Vercel (Hobby) | 0 € | Usage non commercial ; cron 1 fois par jour ; 100 Go de trafic/mois |
| App TV | Vercel (Hobby) | 0 € | Idem (fichiers statiques, mis en cache) |
| Base de données | Neon (via Vercel) | 0 € | 0,5 Go (largement assez pour plusieurs playlists de 50 000 entrées) |
| Codes de pairing, rate limiting | **la même base** | 0 € | Upstash n'est plus nécessaire |
| Proxy de flux | **Render Free** (`render.yaml`) | 0 € | Veille après 15 min ; trafic limité |
| HTTPS du proxy | fourni par Render | 0 € | Pas besoin d'acheter un nom de domaine |
| E-mails de connexion | Resend | 0 € | Sans domaine vérifié, n'envoie qu'à l'adresse du compte Resend (suffisant pour un usage personnel) |
| Fiches films (option) | TMDB | 0 € | Clé API à demander sur themoviedb.org |


---

## État actuel

En ligne, sur l'équipe Vercel `voyaj1` (plan Hobby, gratuit) :
- **App TV** (à ouvrir sur la TV) : <https://oria-tv.vercel.app>
- **Dashboard** : <https://oria-web-omega.vercel.app>
- **Base** : Neon `oria`, plan Free, connectée à `oria-web`.

Pour redéployer : `node scripts/deploy.mjs web`, `tv` ou `all`.

- **Proxy de flux** : <https://oria-stream-proxy.onrender.com> (Render Free, sans carte).
- **E-mails de connexion** : Resend (clé `RESEND_API_KEY`), sans domaine vérifié.
- **MKV** : conversion à la volée par le proxy (`ffmpeg` dans l'image Docker), activée par `STREAM_PROXY_REMUX=1` sur `oria-web`. Si le proxy change, redéployer d'abord Render à la main (**Manual Deploy → Deploy latest commit**) : il ne se met pas à jour tout seul.
- **Connexion Google** : projet Google Cloud `oria-83ea1`, client OAuth « Oria Web ».

## Liens de connexion pour tout le monde (Gmail, gratuit)

Resend sans domaine vérifié n'envoie qu'au propriétaire du compte. Sans domaine, on passe par un compte Gmail (500 envois par jour, vers n'importe quelle adresse) :

1. Un compte Gmail dédié de préférence (ex. `oria.connexion@gmail.com`), avec la **validation en deux étapes** activée.
2. <https://myaccount.google.com/apppasswords> → nom « Oria » → **Créer** : copie les 16 lettres.
3. À la racine du dépôt :
   ```bash
   pnpm dlx vercel@59.23.2 link --yes --project oria-web --scope voyaj1
   pnpm dlx vercel@59.23.2 env add SMTP_USER production --scope voyaj1      # l'adresse Gmail
   pnpm dlx vercel@59.23.2 env add SMTP_PASSWORD production --scope voyaj1  # les 16 lettres
   pnpm dlx vercel@59.23.2 deploy --prod --yes --scope voyaj1
   ```

Dès que ces deux variables existent, elles remplacent Resend.

## Connexion avec Google (gratuit, 5 min)

Le bouton « Continuer avec Google » n'apparaît qu'une fois ces deux variables définies.

1. Sur <https://console.cloud.google.com>, crée un projet, puis ouvre **APIs et services → Écran de consentement OAuth** : type **Externe**, nom Oria, ton adresse. Publie l'application pour que la connexion ne soit pas limitée aux comptes de test.
2. **Identifiants → Créer des identifiants → ID client OAuth → Application Web**. Dans **URI de redirection autorisés**, ajoute :
   `https://oria-web-omega.vercel.app/api/auth/callback/google`
3. Copie l'ID et le secret, puis, à la racine du dépôt :
   ```bash
   vercel link --yes --project oria-web --scope voyaj1
   vercel env add AUTH_GOOGLE_ID production
   vercel env add AUTH_GOOGLE_SECRET production
   node scripts/deploy.mjs web
   ```

Un compte déjà créé par lien e-mail avec la même adresse retrouve ses données.

## Relais vidéo gratuit : Cloudflare Workers

Render ne laisse passer que 5 Go par mois (2 à 3 h de HD), puis facture. Le relais `apps/stream-worker` fait le même travail sur Cloudflare, où le trafic n'est pas facturé (offre gratuite : 100 000 requêtes par jour, soit environ 40 h de direct). Render ne sert plus que de secours automatique et pour convertir les MKV.

1. Crée un compte gratuit sur <https://dash.cloudflare.com/sign-up>, puis, à la racine du dépôt :
   ```bash
   cd apps/stream-worker
   pnpm dlx wrangler@4 login
   ```
2. Déploiement et secret partagé (généré ici, jamais affiché) :
   ```bash
   pnpm dlx wrangler@4 deploy
   node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > .secret
   pnpm dlx wrangler@4 secret put STREAM_PROXY_SECRET < .secret
   cd ../.. && pnpm dlx vercel@59.23.2 link --yes --project oria-web --scope voyaj1
   pnpm dlx vercel@59.23.2 env add STREAM_WORKER_SECRET production --scope voyaj1 < apps/stream-worker/.secret
   rm apps/stream-worker/.secret
   ```
3. Ajoute `STREAM_WORKER_URL` (l'adresse `https://oria-stream.<compte>.workers.dev` affichée par le déploiement) au projet `oria-web`, puis redéploie-le.

Si le relais Cloudflare échoue (limite du jour atteinte, port refusé…), le lecteur bascule seul sur Render.

## Limites de cette installation

- **Render** se met en veille après 15 min : la première chaîne peut mettre 30 à 60 s à démarrer. Le trafic gratuit est limité ; au-delà, le service est suspendu jusqu'au mois suivant, sans frais.
- **Resend** sans domaine vérifié n'envoie qu'à l'adresse du compte Resend.
- **Vercel Hobby** est réservé à un usage non commercial.

## Proxy plus généreux : Oracle Cloud Always Free

Si Render devient trop limité et qu'Oracle accepte ton inscription, le script `apps/stream-proxy/deploy/setup.sh` installe le proxy sur une VM Ubuntu et affiche `STREAM_PROXY_URL` et `STREAM_PROXY_SECRET`. Ajoute-les au projet `oria-web` avec `vercel env add … production`, puis lance `node scripts/deploy.mjs web`. Il faut ouvrir les ports TCP 80 et 443 dans le réseau de la VM.
