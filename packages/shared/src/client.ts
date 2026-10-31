import type { PairStartResponse, PairStatusResponse, TvMeResponse } from './api-types';

/**
 * Client API indépendant du transport : la TV fournit un transport XHR
 * (compatible vieux navigateurs), les tests un transport fetch.
 */
export interface Transport {
  (req: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ status: number; data: unknown }>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message || code);
  }
}

export function createTvApi(transport: Transport, getToken: () => string | null) {
  async function call<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const headers: Record<string, string> = extraHeaders ? { ...extraHeaders } : {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await transport({ method, path, body, headers });
    if (res.status >= 400) {
      const d = (res.data || {}) as { error?: string; message?: string };
      throw new ApiError(res.status, d.error || 'http_' + res.status, d.message);
    }
    return res.data as T;
  }

  return {
    pairStart: () => call<PairStartResponse>('POST', '/api/devices/pair/start'),
    pairStatus: (code: string, secret: string) =>
      call<PairStatusResponse>(
        'GET',
        '/api/devices/pair/status?code=' + encodeURIComponent(code),
        undefined,
        { 'X-Pairing-Secret': secret },
      ),
    me: () => call<TvMeResponse>('GET', '/api/tv/me'),
    unlink: () => call<{ ok: true }>('POST', '/api/tv/unlink'),
  };
}

export type TvApi = ReturnType<typeof createTvApi>;
