// Génère tous les secrets nécessaires au déploiement (à coller dans Vercel).
//   node scripts/secrets.mjs
import { randomBytes } from 'node:crypto';

const hex = (n) => randomBytes(n).toString('hex');
console.log(`AUTH_SECRET=${randomBytes(32).toString('base64')}
CREDENTIALS_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}
CRON_SECRET=${hex(32)}
STREAM_PROXY_SECRET=${hex(32)}`);
