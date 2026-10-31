import type {
  ContentKindApi,
  ContentLanguage,
  EpgGridRow,
  EpgNowNext,
  HomeResponse,
  MovieDetail,
  Page,
  PlaylistSummary,
  PosterCard,
  SearchResponse,
  SeriesDetail,
  TvSettings,
  PairStartResponse,
  PairStatusResponse,
  PlayKind,
  PlayResponse,
  TvCategory,
  TvChannel,
  TvMeResponse,
} from './api-types';

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

/** `getUnlock` : jeton de déverrouillage parental en cours (en-tête X-Parental). */
export function createTvApi(transport: Transport, getToken: () => string | null, getUnlock: () => string | null = () => null) {
  async function call<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const headers: Record<string, string> = extraHeaders ? { ...extraHeaders } : {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const unlock = getUnlock();
    if (unlock) headers['X-Parental'] = unlock;
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
    categories: (kind: ContentKindApi) => call<TvCategory[]>('GET', '/api/tv/categories?kind=' + kind),
    /** `category` : id de catégorie, 'all' ou 'fav'. */
    liveChannels: (category: number | 'all' | 'fav', offset: number, limit: number) =>
      call<Page<TvChannel>>(
        'GET',
        '/api/tv/live/channels?category=' + category + '&offset=' + offset + '&limit=' + limit,
      ),
    liveChannelByNum: (num: number) => call<{ channel: TvChannel | null }>('GET', '/api/tv/live/channel?num=' + num),
    play: (kind: PlayKind, id: number, mode?: 'hls' | 'ts') =>
      call<PlayResponse>('GET', '/api/tv/play?kind=' + kind + '&id=' + id + (mode ? '&mode=' + mode : '')),
    posters: (kind: 'vod' | 'series', category: number | 'all' | 'fav', offset: number, limit: number) =>
      call<Page<PosterCard>>(
        'GET',
        '/api/tv/' + kind + '?category=' + category + '&offset=' + offset + '&limit=' + limit,
      ),
    movie: (id: number) => call<MovieDetail>('GET', '/api/tv/vod/' + id),
    series: (id: number) => call<SeriesDetail>('GET', '/api/tv/series/' + id),
    home: () => call<HomeResponse>('GET', '/api/tv/home'),
    search: (q: string) => call<SearchResponse>('GET', '/api/tv/search?q=' + encodeURIComponent(q)),
    epgNow: (epgIds: string[]) =>
      call<{ [epgId: string]: EpgNowNext }>('GET', '/api/tv/epg/now?ids=' + encodeURIComponent(epgIds.join(','))),
    epgGrid: (category: number | 'all' | 'fav', offset: number, limit: number, from: number, to: number) =>
      call<{ total: number; rows: EpgGridRow[] }>(
        'GET',
        '/api/tv/epg/grid?category=' + category + '&offset=' + offset + '&limit=' + limit + '&from=' + from + '&to=' + to,
      ),
    saveProgress: (kind: 'vod' | 'episode' | 'live', id: number, position: number, duration: number | null) =>
      call<{ ok: true }>('PUT', '/api/tv/progress', { kind, id, position, duration }),
    setFavorite: (kind: ContentKindApi, id: number, on: boolean) =>
      call<{ ok: true }>('POST', '/api/tv/favorites', { kind, id, on }),
    languages: () => call<ContentLanguage[]>('GET', '/api/tv/languages'),
    settings: () => call<TvSettings>('GET', '/api/tv/settings'),
    saveSettings: (s: Partial<Omit<TvSettings, 'hasPin'>>) => call<TvSettings>('PUT', '/api/tv/settings', s),
    /** Vérifie le PIN : renvoie un jeton de déverrouillage valable 1 h. */
    unlockParental: (pin: string) => call<{ token: string }>('POST', '/api/tv/parental', { action: 'verify', pin }),
    setPin: (pin: string | null, currentPin?: string) =>
      call<{ ok: true }>('POST', '/api/tv/parental', { action: 'set', pin, currentPin }),
    playlists: () => call<PlaylistSummary[]>('GET', '/api/tv/playlists'),
    setActivePlaylist: (playlistId: string) => call<{ ok: true }>('PUT', '/api/tv/device', { playlistId }),
  };
}

export type TvApi = ReturnType<typeof createTvApi>;
