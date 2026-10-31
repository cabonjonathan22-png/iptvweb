/**
 * Proxy d'images (logos, affiches) : les URL des playlists sont souvent en
 * http://, donc bloquées sur une page HTTPS, et trop lourdes pour une TV.
 * - URL signée (cf. lib/images.ts) : pas de proxy ouvert ;
 * - redimensionnement (sharp) à des largeurs fixes, PNG pour les logos, JPEG sinon ;
 * - cache immutable : servie une seule fois par le CDN pour chaque image et taille.
 */
import sharp from 'sharp';
import { IMAGE_WIDTHS, type ImageKind } from '@/lib/images';
import { verify } from '@/lib/signing';
import { fetchSource } from '@/lib/sync/source';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

function miss(status: number) {
  // Échec mis en cache 1 h : la TV affiche son repli (initiales) sans réessayer en boucle.
  return new Response(null, { status, headers: { 'Cache-Control': 'public, max-age=3600' } });
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const kind = sp.get('k') as ImageKind;
  const width = Number(sp.get('w'));
  const raw = sp.get('u') || '';
  const sig = sp.get('s') || '';
  if (!IMAGE_WIDTHS[kind]?.includes(width) || !verify('img', kind + '|' + width + '|' + raw, sig)) return miss(403);

  let input: Buffer;
  try {
    const res = await fetchSource(raw, { timeoutMs: 8000, headers: { Accept: 'image/*' } });
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_SOURCE_BYTES) return miss(413);
    input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_SOURCE_BYTES || !input.length) return miss(413);
  } catch {
    return miss(404);
  }

  try {
    const img = sharp(input, { failOn: 'none', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true });
    const out =
      kind === 'logo'
        ? await img.png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer()
        : await img.jpeg({ quality: 74, mozjpeg: true, progressive: true }).toBuffer();
    return new Response(new Uint8Array(out), {
      headers: {
        'Content-Type': kind === 'logo' ? 'image/png' : 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return miss(415);
  }
}
