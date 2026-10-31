import { eq } from 'drizzle-orm';
import { CONTENT_LANGS, detectCategoryLang, type ContentLanguage } from '@iptv/shared';
import { getDb, schema } from '@/lib/db';
import { json } from '@/lib/http';
import { tvContext } from '@/lib/tv-api';

/** Langues réellement présentes dans la playlist active (pour le réglage « Langues du contenu »). */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const db = await getDb();
  const rows = await db
    .select({ name: schema.categories.name })
    .from(schema.categories)
    .where(eq(schema.categories.playlistId, ctx.playlist.id));
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const lang = detectCategoryLang(r.name);
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
  }
  const out: ContentLanguage[] = CONTENT_LANGS.filter((l) => counts[l.code]).map((l) => ({ ...l, categories: counts[l.code]! }));
  return json(out, { headers: { 'Cache-Control': 'no-store' } });
}
