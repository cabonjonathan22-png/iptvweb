#!/usr/bin/env bash
# Installation du proxy de flux sur une VM Ubuntu (Oracle Cloud « Always Free » ou autre).
# À lancer sur la VM, en une commande :
#
#   curl -fsSL https://raw.githubusercontent.com/cabonjonathan22-png/iptvweb/main/apps/stream-proxy/deploy/setup.sh | sudo bash
#
# Ce que fait le script :
#   1. installe Docker ;
#   2. ouvre les ports 80/443 (les images Ubuntu d'Oracle les bloquent par défaut) ;
#   3. choisit un nom HTTPS gratuit <ip>.sslip.io (pas besoin de nom de domaine) ;
#   4. génère le secret partagé, récupère le code du proxy et le démarre avec Caddy
#      (certificat Let's Encrypt automatique) ;
#   5. affiche les deux valeurs à mettre dans Vercel.
#
# Variables facultatives : DOMAIN (votre propre domaine), STREAM_PROXY_SECRET (réutiliser un secret),
# REPO_RAW (autre dépôt / branche).
set -euo pipefail

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/cabonjonathan22-png/iptvweb/main}"
DIR=/opt/oria-proxy

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancez ce script avec sudo." >&2
  exit 1
fi

echo "==> Adresse IP publique"
IP="$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)"
DOMAIN="${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}"
echo "    $IP -> https://$DOMAIN"

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Pare-feu (ports 80 et 443)"
if command -v iptables >/dev/null 2>&1; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then netfilter-persistent save >/dev/null 2>&1 || true; fi
fi
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi

echo "==> Code du proxy"
mkdir -p "$DIR/apps/stream-proxy" "$DIR/packages/shared/src"
for f in apps/stream-proxy/server.ts apps/stream-proxy/Dockerfile apps/stream-proxy/docker-compose.yml apps/stream-proxy/Caddyfile \
  packages/shared/src/stream-token.ts packages/shared/src/net-guard.ts; do
  curl -fsSL "$REPO_RAW/$f" -o "$DIR/$f"
done

ENV_FILE="$DIR/apps/stream-proxy/.env"
if [ -f "$ENV_FILE" ] && [ -z "${STREAM_PROXY_SECRET:-}" ]; then
  # Réinstallation : on garde le secret existant (sinon il faudrait le changer dans Vercel).
  STREAM_PROXY_SECRET="$(grep '^STREAM_PROXY_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
fi
STREAM_PROXY_SECRET="${STREAM_PROXY_SECRET:-$(openssl rand -hex 32)}"
cat > "$ENV_FILE" <<EOF
DOMAIN=$DOMAIN
PUBLIC_URL=https://$DOMAIN
STREAM_PROXY_SECRET=$STREAM_PROXY_SECRET
EOF
chmod 600 "$ENV_FILE"

echo "==> Démarrage (build + certificat HTTPS, ~2 min la première fois)"
cd "$DIR/apps/stream-proxy"
docker compose up -d --build

echo "==> Vérification"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done

echo
if [ "$ok" = 1 ]; then
  echo "Proxy en ligne : https://$DOMAIN/health -> ok"
else
  echo "Le proxy ne répond pas encore en HTTPS. Vérifiez que les ports 80 et 443 sont ouverts"
  echo "dans la « Security List » du réseau (console Oracle), puis : cd $DIR/apps/stream-proxy && docker compose logs"
fi
echo
echo "À renseigner dans Vercel (projet web) :"
echo "  STREAM_PROXY_URL=https://$DOMAIN"
echo "  STREAM_PROXY_SECRET=$STREAM_PROXY_SECRET"
