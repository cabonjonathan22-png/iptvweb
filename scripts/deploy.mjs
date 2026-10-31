// Déploie en production sur Vercel, depuis la racine du monorepo.
//   node scripts/deploy.mjs tv | web | all
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const SCOPE = 'voyaj1';
const PROJECTS = { tv: 'oria-tv', web: 'oria-web' };

function vercel(args) {
  const r = spawnSync('vercel', [...args, '--scope', SCOPE], { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const target = process.argv[2];
const names = target === 'all' ? ['web', 'tv'] : PROJECTS[target] ? [target] : null;
if (!names) {
  console.error('Usage : node scripts/deploy.mjs tv | web | all');
  process.exit(1);
}

for (const n of names) {
  console.log(`\n==> ${PROJECTS[n]}`);
  vercel(['link', '--yes', '--project', PROJECTS[n]]);
  // `vercel link` crée ce fichier à la racine ; il ne sert à rien ici.
  rmSync('.env.local', { force: true });
  vercel(['deploy', '--prod', '--yes']);
}
