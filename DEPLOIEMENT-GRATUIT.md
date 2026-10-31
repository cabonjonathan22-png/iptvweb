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

## Ce que tu fais (inscriptions et clics : je ne peux pas créer de comptes à ta place)

### 1. Base de données (2 min)
Dans Vercel → **Storage** → **Create Database** → **Neon** → plan **Free** → nom `oria`. Tu n'as pas besoin de la connecter à un projet : je m'en charge.

### 2. Proxy de flux sur Oracle Cloud (15 min)
1. Inscription sur <https://signup.cloud.oracle.com> (offre « Always Free »).
2. **Compute → Instances → Create instance** :
   - Image : **Ubuntu 24.04** ;
   - Shape : **VM.Standard.A1.Flex** (Ampere, 1 OCPU et 6 Go suffisent), sinon VM.Standard.E2.1.Micro ;
   - **Add SSH keys** : « Generate a key pair », télécharge la clé privée.
3. **Networking → Virtual cloud networks → (ton VCN) → Security Lists → Default** → *Add Ingress Rules* : source `0.0.0.0/0`, TCP, ports `80,443`.
4. Connexion à la VM : `ssh -i cle.key ubuntu@<IP publique>`, puis :
   ```bash
   curl -fsSL https://raw.githubusercontent.com/cabonjonathan22-png/iptvweb/main/apps/stream-proxy/deploy/setup.sh | sudo bash
   ```
5. Le script affiche `STREAM_PROXY_URL` et `STREAM_PROXY_SECRET` : envoie-les-moi.

### 3. E-mail de connexion (3 min)
Inscription sur <https://resend.com> avec l'adresse qui servira à te connecter, **API Keys → Create** : envoie-moi la clé (`re_…`).
(Ou Google : Google Cloud Console → OAuth client « Web application », redirection `https://<ton-app>.vercel.app/api/auth/callback/google`.)

---

## Ce que je fais (la CLI Vercel est déjà connectée)

1. Je crée les deux projets Vercel (`oria-web` et `oria-tv`) depuis le dépôt, en monorepo pnpm.
2. Je génère les secrets (`node scripts/secrets.mjs`) et je configure toutes les variables d'environnement.
3. Je connecte la base Neon au projet web. Les migrations s'appliquent au build.
4. Je déploie, je règle `NEXT_PUBLIC_APP_URL`, `TV_APP_ORIGINS` et `VITE_API_URL` avec les URL `*.vercel.app`, puis je redéploie.
5. Je vérifie : santé du proxy, création de compte, pairing, synchro d'une playlist de test, lecture via le proxy.

Sans nom de domaine, les adresses seront du type `oria-web-xxx.vercel.app` (dashboard) et `oria-tv-xxx.vercel.app` (à ouvrir sur la TV).
