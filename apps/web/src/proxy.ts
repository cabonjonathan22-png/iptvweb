/**
 * CORS pour les endpoints appelés par l'app TV (autre origine : tv.mondomaine.com).
 * Les préflights OPTIONS sont répondus ici et mis en cache 10 min par le navigateur
 * (le polling du pairing envoie un en-tête custom => préflight).
 */
import { NextResponse, type NextRequest } from 'next/server';

const allowed = (process.env.TV_APP_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Pairing-Secret,If-None-Match',
    'Access-Control-Expose-Headers': 'ETag,Retry-After',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && (allowed.includes('*') || allowed.includes(origin))) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

export function proxy(req: NextRequest) {
  const headers = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: ['/api/tv/:path*', '/api/devices/pair/start', '/api/devices/pair/status', '/api/img'],
};
