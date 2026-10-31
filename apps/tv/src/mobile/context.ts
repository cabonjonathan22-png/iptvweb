import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { TvChannel, TvMeResponse } from '@iptv/shared';
import type { PagedSource } from '../lib/paged-source';
import type { VodPlayback } from './Player';

export type Tab = 'home' | 'live' | 'movies' | 'series' | 'search' | 'settings';

export type Route =
  | { name: Tab }
  | { name: 'movie'; id: number }
  | { name: 'show'; id: number }
  | { name: 'playLive'; channel: TvChannel; source?: PagedSource<TvChannel>; index?: number }
  | { name: 'playVod'; playback: VodPlayback };

export interface MobileApi {
  me: TvMeResponse | null;
  tab: Tab;
  go: (tab: Tab) => void;
  push: (route: Route) => void;
  boot: () => void;
  reset: () => void;
}

export const MobileCtx = createContext<MobileApi>(null as unknown as MobileApi);
export const useMobile = () => useContext(MobileCtx);
