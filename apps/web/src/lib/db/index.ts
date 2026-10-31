/**
 * Accès base de données.
 * - Production / staging : Postgres (Neon, Vercel Postgres…) via postgres-js.
 * - Dev local sans DATABASE_URL : PGlite (Postgres en WASM, fichier local),
 *   migrations appliquées automatiquement. Zéro service à installer.
 */
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), 'drizzle');

const g = globalThis as unknown as { __dbPromise?: Promise<DB> };

async function connectPostgres(url: string): Promise<DB> {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  // prepare:false => compatible avec les poolers (Neon pooled, PgBouncer).
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  return drizzle(client, { schema }) as unknown as DB;
}

async function connectPglite(): Promise<DB> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), '.data', 'pglite');
  // PGlite ne crée pas les dossiers parents.
  (await import('node:fs')).mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir, { extensions: { pg_trgm } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!g.__dbPromise) {
    const url = process.env.DATABASE_URL;
    if (url) {
      g.__dbPromise = connectPostgres(url);
    } else if (process.env.VERCEL) {
      throw new Error('DATABASE_URL manquant');
    } else {
      g.__dbPromise = connectPglite();
    }
    g.__dbPromise.catch(() => {
      g.__dbPromise = undefined;
    });
  }
  return g.__dbPromise;
}

export { schema };
