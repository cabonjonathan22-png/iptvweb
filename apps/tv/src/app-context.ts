import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { TvMeResponse } from '@iptv/shared';

export type ScreenName =
  | 'pairing'
  | 'home'
  | 'live'
  | 'guide'
  | 'movies'
  | 'series'
  | 'movie'
  | 'seriesDetail'
  | 'search'
  | 'settings'
  | 'keydebug';

export interface Entry {
  key: string;
  name: ScreenName;
  params?: Record<string, unknown>;
}

export interface AppApi {
  me: TvMeResponse | null;
  /** Recharge le profil (après pairing, ou pour vérifier une révocation). */
  boot: () => void;
  push: (name: ScreenName, params?: Record<string, unknown>) => void;
  back: () => void;
  reset: (name: ScreenName) => void;
  /** À appeler sur toute réponse 401 : le token a été révoqué. */
  onUnauthorized: () => void;
}

export const AppCtx = createContext<AppApi>(null as unknown as AppApi);
export const useApp = () => useContext(AppCtx);
