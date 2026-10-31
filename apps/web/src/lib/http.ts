import { NextResponse } from 'next/server';

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function apiError(status: number, error: string, message?: string, headers?: HeadersInit) {
  return NextResponse.json({ error, message }, { status, headers });
}

export function tooMany(reset: number) {
  const retry = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return apiError(429, 'rate_limited', 'Trop de requêtes, réessayez dans un instant.', {
    'Retry-After': String(retry),
  });
}

/** IP client derrière le proxy Vercel. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}
