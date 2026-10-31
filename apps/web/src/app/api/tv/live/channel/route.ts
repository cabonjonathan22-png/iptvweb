import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { apiError, json } from '@/lib/http';
import { tvContext } from '@/lib/tv-api';
import { channelColumns, toTvChannel, visibleChannels } from '@/lib/tv-channels';

/** Chaîne par numéro (saisie directe aux chiffres de la télécommande). */
export async function GET(req: Request) {
  const ctx = await tvContext(req);
  if (ctx instanceof Response) return ctx;
  const num = Number(new URL(req.url).searchParams.get('num'));
  if (!Number.isInteger(num) || num < 0) return apiError(400, 'bad_num');
  const db = await getDb();
  const [row] = await db
    .select(channelColumns)
    .from(schema.channels)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.channels.categoryId))
    .where(visibleChannels(ctx.playlist.id, ctx.lockedOk, eq(schema.channels.num, num)))
    .orderBy(asc(schema.channels.id))
    .limit(1);
  return json({ channel: row ? toTvChannel(row, ctx.origin) : null });
}
