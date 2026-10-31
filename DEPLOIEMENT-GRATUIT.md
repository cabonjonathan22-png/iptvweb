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

## Limites de cette installation

- **Render** se met en veille après 15 min : la première chaîne peut mettre 30 à 60 s à démarrer. Le trafic gratuit est limité ; au-delà, le service est suspendu jusqu'au mois suivant, sans frais.
- **Resend** sans domaine vérifié n'envoie qu'à l'adresse du compte Resend.
- **Vercel Hobby** est réservé à un usage non commercial.

## Proxy plus généreux : Oracle Cloud Always Free

Si Render devient trop limité et qu'Oracle accepte ton inscription, le script `apps/stream-proxy/deploy/setup.sh` installe le proxy sur une VM Ubuntu et affiche `STREAM_PROXY_URL` et `STREAM_PROXY_SECRET`. Ajoute-les au projet `oria-web` avec `vercel env add … production`, puis lance `node scripts/deploy.mjs web`. Il faut ouvrir les ports TCP 80 et 443 dans le réseau de la VM.
