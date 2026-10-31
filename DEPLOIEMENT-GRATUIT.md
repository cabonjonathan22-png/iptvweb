# Déploiement 100 % gratuit

| Brique | Service | Offre gratuite | Limite à connaître |
|---|---|---|---|
| Dashboard + API | Vercel (Hobby) | 0 € | Usage non commercial ; cron 1 fois par jour ; 100 Go de trafic/mois |
| App TV | Vercel (Hobby) | 0 € | Idem (fichiers statiques, mis en cache) |
| Base de données | Neon (via Vercel) | 0 € | 0,5 Go (largement assez pour plusieurs playlists de 50 000 entrées) |
| Codes de pairing, rate limiting | **la même base** | 0 € | Upstash n'est plus nécessaire |
| Proxy de flux | **Oracle Cloud Always Free** | 0 € à vie | Vérification par carte à l'inscription (aucun débit) ; 10 To de trafic/mois |
| HTTPS du proxy | sslip.io + Let's Encrypt | 0 € | Pas besoin d'acheter un nom de domaine |
| E-mails de connexion | Resend | 0 € | Sans domaine vérifié, n'envoie qu'à l'adresse du compte Resend (suffisant pour un usage personnel) |
| Fiches films (option) | TMDB | 0 € | Clé API à demander sur themoviedb.org |

Alternative pour le proxy : **Render** (`render.yaml`), inscription avec GitHub, sans carte. Mais il se met en veille après 15 min (premier lancement de chaîne en 30 à 60 s) et ne laisse passer qu'environ 100 Go par mois (une quarantaine d'heures de HD).

---

## État actuel

Déjà fait : les projets Vercel `oria-web` et `oria-tv` existent (équipe `voyaj1`, plan Hobby, gratuit), avec leur dossier racine, Node 22 et les variables `NEXT_PUBLIC_APP_URL`, `TV_APP_ORIGINS`, `AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `CRON_SECRET` et `VITE_API_URL`. Rien n'est encore déployé.

## Ce qu'il reste à faire de ton côté

### 1. Base de données (2 min)
Vercel exige une confirmation humaine pour accepter les conditions de Neon.
Projet **oria-web** → **Storage** → **Create Database** → **Neon** → plan **Free** → connecter au projet, environnement **Production**. La variable `DATABASE_URL` est ajoutée automatiquement.

### 2. Déployer (1 commande)
À la racine du dépôt :
```bash
node scripts/deploy.mjs all
```
Les migrations s'appliquent pendant le build du dashboard. Adresses : <https://oria-web.vercel.app> (dashboard) et <https://oria-tv.vercel.app> (à ouvrir sur la TV).

### 3. Connexion par e-mail (3 min)
Inscription sur <https://resend.com> avec l'adresse qui servira à te connecter, **API Keys → Create**, puis :
```bash
vercel link --yes --project oria-web --scope voyaj1
vercel env add AUTH_RESEND_KEY production
node scripts/deploy.mjs web
```
Sans cette clé, aucun e-mail ne part : le lien de connexion n'apparaît que dans les logs Vercel.

### 4. Proxy de flux sur Oracle Cloud (15 min)
Sans lui, l'interface fonctionne mais les chaînes en `http://` ne se lisent pas.
1. Inscription sur <https://signup.cloud.oracle.com> (offre « Always Free »).
2. **Compute → Instances → Create instance** :
   - Image : **Ubuntu 24.04** ;
   - Shape : **VM.Standard.A1.Flex** (1 OCPU et 6 Go suffisent), sinon VM.Standard.E2.1.Micro ;
   - **Add SSH keys** : « Generate a key pair », télécharge la clé privée.
3. **Networking → Virtual cloud networks → (ton VCN) → Security Lists → Default** → *Add Ingress Rules* : source `0.0.0.0/0`, TCP, ports `80,443`.
4. Connexion à la VM : `ssh -i cle.key ubuntu@<IP publique>`, puis :
   ```bash
   curl -fsSL https://raw.githubusercontent.com/cabonjonathan22-png/iptvweb/main/apps/stream-proxy/deploy/setup.sh | sudo bash
   ```
5. Le script affiche `STREAM_PROXY_URL` et `STREAM_PROXY_SECRET`. Ajoute-les au projet `oria-web` avec `vercel env add … production`, puis `node scripts/deploy.mjs web`.

Le secret s'affiche dans ton terminal : évite de le coller dans un endroit public.
