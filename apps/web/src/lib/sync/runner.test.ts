/**
 * Test d'intégration du moteur de synchro, sur une base PGlite jetable et un
 * serveur M3U local : découpage en plusieurs invocations, reprise au curseur,
 * purge des contenus disparus, conservation des personnalisations.
 */
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateM3uLines } from '@iptv/shared/fixtures';

let server: http.Server;
let base = '';

beforeAll(async () => {
  process.env.PGLITE_DIR = path.join(os.tmpdir(), 'oria-sync-test-' + Date.now());
  process.env.ALLOW_PRIVATE_SOURCES = '1';
  server = http.createServer((req, res) => {
    const n = Number(new URL(req.url!, 'http://x').searchParams.get('n'));
    res.writeHead(200);
    for (const l of generateM3uLines({ count: n, baseUrl: 'http://cdn.test' })) res.write(l + '\n');
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
}, 60_000);

afterAll(() => server?.close());

describe('sync runner', () => {
  it('splits work across invocations, resumes, purges stale rows and keeps customizations', async () => {
    const { getDb, schema } = await import('../db');
    const { runJob, startSync } = await import('./runner');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();

    const [user] = await db.insert(schema.users).values({ email: 'sync@test' }).returning();
    const [p] = await db
      .insert(schema.playlists)
      .values({ userId: user!.id, name: 't', type: 'm3u_url', sourceUrl: base + '/?n=5000' })
      .returning();

    // Budget nul : chaque invocation n'écrit qu'un lot (1000) puis rend la main.
    const jobId = await startSync(p!.id);
    let result = '';
    let invocations = 0;
    while (result !== 'done' && invocations < 20) {
      result = await runJob(jobId, 0);
      invocations++;
    }
    expect(result).toBe('done');
    expect(invocations).toBeGreaterThan(3);

    let row = await db.query.playlists.findFirst({ where: eq(schema.playlists.id, p!.id) });
    expect(row).toMatchObject({ status: 'ready', liveCount: 3000, vodCount: 1000, lastError: null });
    expect(row!.meta.headerEpgUrl).toBe('http://cdn.test/epg.xml');

    // Personnalisation utilisateur sur une catégorie.
    const cat = await db.query.categories.findFirst({ where: eq(schema.categories.name, 'Live 3') });
    await db.update(schema.categories).set({ hidden: true, customName: 'Ma catégorie' }).where(eq(schema.categories.id, cat!.id));
    const chan = await db.query.channels.findFirst({ where: eq(schema.channels.name, 'Chaîne 0') });

    // Resynchro d'une source plus petite : purge + ids stables + personnalisation conservée.
    await db.update(schema.playlists).set({ sourceUrl: base + '/?n=2000' }).where(eq(schema.playlists.id, p!.id));
    expect(await runJob(await startSync(p!.id))).toBe('done');
    row = await db.query.playlists.findFirst({ where: eq(schema.playlists.id, p!.id) });
    expect(row).toMatchObject({ liveCount: 1200, vodCount: 400 });
    const cat2 = await db.query.categories.findFirst({ where: eq(schema.categories.id, cat!.id) });
    expect(cat2).toMatchObject({ hidden: true, customName: 'Ma catégorie' });
    const chan2 = await db.query.channels.findFirst({ where: eq(schema.channels.name, 'Chaîne 0') });
    expect(chan2!.id).toBe(chan!.id);
  }, 120_000);

  it('reports a readable error for non-playlist content', async () => {
    const { getDb, schema } = await import('../db');
    const { runJob, startSync } = await import('./runner');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();
    const [user] = await db.insert(schema.users).values({ email: 'err@test' }).returning();
    const [p] = await db
      .insert(schema.playlists)
      .values({ userId: user!.id, name: 'e', type: 'm3u_url', sourceUrl: base.replace(/:\d+$/, ':1') + '/x' })
      .returning();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runJob(await startSync(p!.id))).toBe('error');
    const row = await db.query.playlists.findFirst({ where: eq(schema.playlists.id, p!.id) });
    expect(row!.status).toBe('error');
    expect(row!.lastError).toMatch(/Connexion impossible/);
  }, 60_000);
});
