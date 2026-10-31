/**
 * Image dans l'image, AirPlay et Chromecast, selon ce que le navigateur propose.
 * Le SDK Cast n'est chargé que sur Chrome hors TV, et l'option n'apparaît que
 * si un appareil est trouvé sur le réseau.
 */
import type { PlayResponse } from '@iptv/shared';
import { device, isIOS } from '../lib/device';
import { player } from './engine';

/* eslint-disable @typescript-eslint/no-explicit-any -- API non typées (WebKit, SDK Cast) */
const w = window as any;

export function canPip(): boolean {
  const v = player.video as any;
  if (!v) return false;
  if (document.pictureInPictureEnabled) return true;
  return !!(v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture'));
}

export function togglePip() {
  const v = player.video as any;
  if (!v) return;
  if (document.pictureInPictureEnabled) {
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => undefined);
    else v.requestPictureInPicture().catch(() => undefined);
  } else if (v.webkitSetPresentationMode) {
    v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
  }
}

export const canAirplay = () => !!(player.video && (player.video as any).webkitShowPlaybackTargetPicker);
export const showAirplay = () => (player.video as any).webkitShowPlaybackTargetPicker();

const CAST_SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
let castRequested = false;
let castAvailable = false;

export function initCast() {
  if (castRequested || device === 'tv' || isIOS) return;
  const ua = navigator.userAgent || '';
  if (!/chrome/i.test(ua) || /edg|opr|samsung/i.test(ua)) return;
  castRequested = true;
  w.__onGCastApiAvailable = (ok: boolean) => {
    if (!ok || !w.cast || !w.cast.framework) return;
    const fw = w.cast.framework;
    const ctx = fw.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId: w.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    const update = () => {
      castAvailable = ctx.getCastState() !== fw.CastState.NO_DEVICES_AVAILABLE;
    };
    ctx.addEventListener(fw.CastContextEventType.CAST_STATE_CHANGED, update);
    update();
  };
  const s = document.createElement('script');
  s.src = CAST_SDK;
  s.async = true;
  document.head.appendChild(s);
}

export const canCast = () => castAvailable;

const CONTENT_TYPE: Record<string, string> = { hls: 'application/x-mpegurl', mp4: 'video/mp4' };

/**
 * Envoie la lecture sur le Chromecast choisi. À appeler sur un appui : le choix de
 * l'appareil doit partir du geste, donc avant de demander l'URL au serveur.
 */
export function castMedia(source: () => Promise<PlayResponse>, title: string, startAt?: number): Promise<void> {
  const chrome = w.chrome;
  const ctx = w.cast.framework.CastContext.getInstance();
  return ctx.requestSession().then(() =>
    source().then((r) => {
      const type = CONTENT_TYPE[r.type];
      if (!type) throw new Error('Ce format (' + r.type.toUpperCase() + ") n'est pas lisible par le Chromecast.");
      const info = new chrome.cast.media.MediaInfo(r.url, type);
      info.streamType = r.live ? chrome.cast.media.StreamType.LIVE : chrome.cast.media.StreamType.BUFFERED;
      info.metadata = new chrome.cast.media.GenericMediaMetadata();
      info.metadata.title = title;
      const req = new chrome.cast.media.LoadRequest(info);
      if (startAt) req.currentTime = startAt;
      return ctx
        .getCurrentSession()
        .loadMedia(req)
        .then(() => {
          // Le son et l'image passent sur la TV : on coupe ici.
          if (player.video) player.video.pause();
        });
    }),
  );
}
