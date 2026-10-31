# Build depuis la RACINE du dépôt :
#   docker build -f apps/stream-proxy/Dockerfile -t oria-stream-proxy .
# Aucune dépendance npm : seuls le serveur et deux modules partagés sont copiés.
FROM node:22-alpine
WORKDIR /app
COPY packages/shared/src/stream-token.ts packages/shared/src/net-guard.ts packages/shared/src/
COPY apps/stream-proxy/server.ts apps/stream-proxy/
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:$PORT/health || exit 1
CMD ["node", "apps/stream-proxy/server.ts"]
