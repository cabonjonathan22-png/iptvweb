/**
 * Moteur de lecture. Un SEUL élément <video> pour toute l'app (aperçu et plein
 * écran), attaché une fois au démarrage.
 *
 * Chaîne de lecture :
 *   HLS : natif si video.canPlayType('application/vnd.apple.mpegurl'), sinon hls.js
 *   TS  : mpegts.js (MSE), sinon natif (certaines TV lisent le TS directement)
 *   MP4 / MKV : natif (MKV : message clair si le navigateur ne sait pas le lire)
 * hls.js et mpegts.js sont chargés à la demande (hors bundle initial).
 *
 * Résilience : reconnexion avec backoff (1, 2, 4, 8 s, affichée à l'écran), récupération des
 * erreurs média hls.js, chien de garde sur les blocages du direct. Chaque
 * chargement incrémente `session` : les callbacks d'un flux précédent (zapping
 * rapide) sont ignorés, et l'instance précédente est détruite proprement.
 */
import type { StreamType } from '@iptv/shared';
import { device } from '../lib/device';
import { flags } from '../lib/devflags';
import { session } from '../lib/session';

export interface Source {
  url: string;
  type: StreamType;
  live: boolean;
  startAt?: number;
  /** Fichier converti à la volée par le proxy (MKV…). */
  remux?: { base: string };
  /** Direct : l'autre format, à essayer si celui-ci échoue. */
  alternate?: () => Promise<{ url: string; type: StreamType }>;
  onPlaying?: (type: StreamType) => void;
}

interface RemuxInfo {
  duration: number | null;
  video: string | null;
  audio: { id: number; codec: string; lang: string | null; title: string | null; channels: number | null }[];
}

/** Codes de langue à 3 lettres des MKV -> 2 lettres des réglages. */
const LANG3: Record<string, string> = { fre: 'fr', fra: 'fr', eng: 'en', spa: 'es', ger: 'de', deu: 'de', ita: 'it', por: 'pt', ara: 'ar' };
const lang2 = (l: string | null) => (l ? LANG3[l.toLowerCase()] || l.toLowerCase().slice(0, 2) : null);

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    // Le proxy gratuit peut être en veille, et il doit ouvrir le fichier chez le fournisseur.
    x.timeout = 90_000;
    x.onload = () => {
      try {
        if (x.status === 200) resolve(JSON.parse(x.responseText) as T);
        else reject(new Error('http ' + x.status));
      } catch (e) {
        reject(e);
      }
    };
    x.onerror = x.ontimeout = () => reject(new Error('network'));
    x.send();
  });
}

export type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error' | 'ended';

export interface PlayerError {
  kind: 'network' | 'unsupported' | 'media';
  message: string;
}

export interface Track {
  id: number;
  label: string;
  active: boolean;
}

export type View = { mode: 'hidden' } | { mode: 'preview'; x: number; y: number; w: number; h: number } | { mode: 'full' };

/**
 * Essais automatiques avant d'afficher une erreur (environ 40 s, plus le temps de chaque essai) :
 * les refus passagers sont courants (limite de connexions du fournisseur au zapping, proxy qui se réveille).
 */
const RETRY_DELAYS = [300, 700, 1500, 2500, 4000, 6000, 8000, 8000, 8000];
/** Chaîne répondant « n'existe pas » : on conclut plus vite. */
const GONE_RETRIES = 4;
/** Direct bloqué en chargement plus longtemps que ça : on relance le flux. */
const STALL_MS = 20_000;
/** Une fois l'erreur affichée, on continue d'essayer en silence : elle disparaît dès que ça repart. */
const SILENT_RETRY_MS = 15_000;
const SILENT_RETRIES = 20;

const MESSAGES = {
  network: 'La chaîne ne répond pas pour l’instant. Nouvel essai automatique en cours…',
  unsupported: 'Ce fichier n’a pas pu être lu : format non pris en charge par votre TV, ou fichier indisponible chez votre fournisseur.',
  mkv: 'Ce fichier MKV n’a pas pu être lu : le navigateur de votre TV ne gère souvent pas ce format (ou le fichier est indisponible). Essayez une autre version si votre fournisseur en propose.',
  hevc: 'Cette vidéo est en HEVC (H.265), que ce navigateur ne sait pas décoder. Essayez sur un autre appareil, ou une autre version si votre fournisseur en propose.',
  remux: 'Ce fichier n’a pas pu être préparé pour la lecture : il est peut-être indisponible chez votre fournisseur.',
  media: 'Le flux vidéo est illisible (erreur de décodage).',
};

/* eslint-disable @typescript-eslint/no-explicit-any -- hls.js / mpegts.js chargés dynamiquement */
class Engine {
  video: HTMLVideoElement | null = null;
  state: PlayState = 'idle';
  error: PlayerError | null = null;
  src: Source | null = null;
  view: View = { mode: 'hidden' };
  /** Tentative de reconnexion en cours (affichée : jamais d'attente silencieuse). */
  reconnect: { attempt: number; max: number } | null = null;

  private remuxInfo: RemuxInfo | null = null;
  private remuxOffset = 0;
  private remuxAudio = 0;
  private hls: any = null;
  private mts: any = null;
  private nativeActive = false;
  private session = 0;
  private retries = 0;
  private retryTimer = 0;
  private stallTimer = 0;
  private listeners: Array<() => void> = [];
  private silent = false;
  private silentLeft = 0;

  attach(v: HTMLVideoElement) {
    this.video = v;
    v.addEventListener('playing', () => {
      this.retries = 0;
      this.reconnect = null;
      this.clearStall();
      this.silent = false;
      this.error = null;
      if (this.src && this.src.onPlaying) this.src.onPlaying(this.src.type);
      this.set('playing');
    });
    // Le réseau revient : inutile d'attendre le prochain essai.
    window.addEventListener('online', () => {
      if (this.state === 'error' && this.src && this.src.live) this.retry();
    });
    v.addEventListener('waiting', () => {
      if (this.state === 'error' || !this.src) return;
      this.set(this.state === 'loading' ? 'loading' : 'buffering');
      this.armStall();
    });
    v.addEventListener('timeupdate', () => {
      if (this.state === 'buffering' || this.state === 'loading') {
        if (!v.paused && v.readyState >= 3) this.set('playing');
      }
      this.clearStall();
    });
    v.addEventListener('pause', () => {
      if (this.state === 'playing' && !v.ended) this.set('paused');
    });
    v.addEventListener('error', () => this.onNativeError());
    v.addEventListener('ended', () => {
      if (this.src && this.src.live) this.scheduleRetry('network');
      else if (this.src) this.set('ended');
    });
    v.addEventListener('loadedmetadata', () => this.applyLangPrefs());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private emit() {
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i]!();
  }

  private set(s: PlayState) {
    if (this.state === s) return;
    this.state = s;
    this.emit();
  }

  setView(v: View) {
    this.view = v;
    this.emit();
  }

  /* -------------------------------------------------------------- API */

  load(src: Source) {
    this.teardown();
    this.src = src;
    this.error = null;
    this.retries = 0;
    this.reconnect = null;
    this.remuxInfo = null;
    this.remuxOffset = src.remux && src.startAt ? Math.floor(src.startAt) : 0;
    this.remuxAudio = 0;
    this.silent = false;
    this.silentLeft = SILENT_RETRIES;
    this.start();
  }

  retry() {
    if (!this.src) return;
    this.teardown();
    this.error = null;
    this.retries = 0;
    this.silent = false;
    this.silentLeft = SILENT_RETRIES;
    this.start();
  }

  stop() {
    this.teardown();
    this.src = null;
    this.error = null;
    this.silent = false;
    this.set('idle');
  }

  toggle() {
    const v = this.video;
    if (!v || !this.src) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }

  /** Position et durée courantes (secondes ; durée null si inconnue / direct). */
  position(): number {
    return this.remuxOffset + (this.video ? this.video.currentTime : 0);
  }

  duration(): number | null {
    if (this.src && this.src.remux && this.remuxInfo && this.remuxInfo.duration) return this.remuxInfo.duration;
    const d = this.video ? this.video.duration : NaN;
    return isFinite(d) && d > 0 ? d : null;
  }

  seekTo(seconds: number) {
    const v = this.video;
    if (!v || !this.src || this.src.live) return;
    const d = this.duration();
    const target = Math.max(0, d ? Math.min(d - 1, seconds) : seconds);
    if (this.src.remux) return this.remuxSeek(target);
    v.currentTime = target;
  }

  /** Dans ce qui est déjà converti : déplacement simple. Sinon le proxy repart de cette position. */
  private remuxSeek(target: number) {
    const v = this.video!;
    const rel = target - this.remuxOffset;
    const s = v.seekable;
    if (rel >= 0 && s && s.length && rel <= s.end(s.length - 1)) {
      v.currentTime = rel;
      return;
    }
    this.remuxRestart(target);
  }

  private remuxRestart(at: number) {
    this.remuxOffset = Math.floor(at);
    this.teardown();
    this.retries = 0;
    this.start();
  }

  /** Pistes audio / sous-titres selon les langues préférées du compte. */
  private applyLangPrefs() {
    const { audioLang, subtitleLang } = session.settings;
    const match = (lang: string | undefined, want: string | null) =>
      !!want && !!lang && lang.toLowerCase().slice(0, 2) === want.slice(0, 2);
    if (this.hls) {
      const audio: any[] = this.hls.audioTracks || [];
      const ai = audio.findIndex((t) => match(t.lang, audioLang));
      if (ai >= 0 && ai !== this.hls.audioTrack) this.hls.audioTrack = ai;
      const subs: any[] = this.hls.subtitleTracks || [];
      const si = subs.findIndex((t) => match(t.lang, subtitleLang));
      if (si >= 0) {
        this.hls.subtitleTrack = si;
        this.hls.subtitleDisplay = true;
      }
      return;
    }
    const v = this.video as any;
    if (!v) return;
    if (v.audioTracks && audioLang) {
      let found = -1;
      for (let i = 0; i < v.audioTracks.length; i++) if (match(v.audioTracks[i].language, audioLang)) found = i;
      if (found >= 0) for (let i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = i === found;
    }
    if (subtitleLang) {
      const tt = v.textTracks as TextTrackList;
      for (let i = 0; i < tt.length; i++) if (match(tt[i]!.language, subtitleLang)) tt[i]!.mode = 'showing';
    }
  }

  seekBy(seconds: number) {
    const v = this.video;
    if (this.src && this.src.remux) return this.seekTo(this.position() + seconds);
    if (!v || !this.src || this.src.live || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + seconds));
  }

  audioTracks(): Track[] {
    if (this.src && this.src.remux && this.remuxInfo) {
      return this.remuxInfo.audio.map((a) => ({
        id: a.id,
        label: a.title || (a.lang ? a.lang.toUpperCase() : 'Piste ' + (a.id + 1)),
        active: a.id === this.remuxAudio,
      }));
    }
    if (this.hls) {
      return (this.hls.audioTracks || []).map((t: any, i: number) => ({
        id: i,
        label: t.name || t.lang || 'Piste ' + (i + 1),
        active: i === this.hls.audioTrack,
      }));
    }
    const at = this.video && (this.video as any).audioTracks;
    if (!at) return [];
    const out: Track[] = [];
    for (let i = 0; i < at.length; i++) {
      out.push({ id: i, label: at[i].label || at[i].language || 'Piste ' + (i + 1), active: !!at[i].enabled });
    }
    return out;
  }

  setAudioTrack(id: number) {
    if (this.src && this.src.remux) {
      if (id === this.remuxAudio) return;
      this.remuxAudio = id;
      this.remuxRestart(this.position());
      this.emit();
      return;
    }
    if (this.hls) this.hls.audioTrack = id;
    else {
      const at = this.video && (this.video as any).audioTracks;
      if (at) for (let i = 0; i < at.length; i++) at[i].enabled = i === id;
    }
    this.emit();
  }

  /** Sous-titres ; id -1 = désactivés. */
  subtitleTracks(): Track[] {
    if (this.hls) {
      return (this.hls.subtitleTracks || []).map((t: any, i: number) => ({
        id: i,
        label: t.name || t.lang || 'Sous-titres ' + (i + 1),
        active: i === this.hls.subtitleTrack,
      }));
    }
    const tt = this.video ? this.video.textTracks : null;
    const out: Track[] = [];
    if (tt) {
      for (let i = 0; i < tt.length; i++) {
        const t = tt[i]!;
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          out.push({ id: i, label: t.label || t.language || 'Sous-titres ' + (i + 1), active: t.mode === 'showing' });
        }
      }
    }
    return out;
  }

  setSubtitleTrack(id: number) {
    if (this.hls) {
      this.hls.subtitleTrack = id;
      this.hls.subtitleDisplay = id >= 0;
    } else if (this.video) {
      const tt = this.video.textTracks;
      for (let i = 0; i < tt.length; i++) tt[i]!.mode = i === id ? 'showing' : 'disabled';
    }
    this.emit();
  }

  /* ------------------------------------------------------- Chargement */

  private async start() {
    const s = ++this.session;
    let src = this.src;
    const v = this.video;
    if (!src || !v) return;
    if (!this.silent) this.set('loading');
    this.armStall();
    try {
      if (src.remux) {
        if (!this.remuxInfo) {
          const info = await fetchJson<RemuxInfo>(src.remux.base + '/info');
          if (s !== this.session) return;
          if (info.video === 'hevc' && !this.canPlayHevc()) {
            this.remuxInfo = info;
            this.error = { kind: 'unsupported', message: MESSAGES.hevc };
            this.state = 'error';
            this.emit();
            return;
          }
          this.remuxInfo = info;
          const want = session.settings.audioLang;
          const pick = want ? info.audio.filter((a) => lang2(a.lang) === want.slice(0, 2))[0] : null;
          if (pick) this.remuxAudio = pick.id;
          this.emit();
        }
        src = { ...src, url: src.remux.base + '/' + this.remuxOffset + '/' + this.remuxAudio + '/index.m3u8', startAt: undefined };
      }
      if (src.type === 'hls') {
        // hls.js partout où il fonctionne : il gère les flux instables bien mieux que le lecteur
        // natif des navigateurs récents. Natif : sans MSE (iPhone), et pour le direct sur TV.
        const hasMse = !!(window as any).MediaSource;
        const useNative = !hasMse || (device === 'tv' && !src.remux);
        if (!flags.forceHlsJs && useNative && v.canPlayType('application/vnd.apple.mpegurl')) return this.native(src);
        const Hls = (await import('hls.js')).default as any;
        if (s !== this.session) return;
        if (Hls.isSupported()) return this.withHls(Hls, src, s);
        return this.fail('unsupported');
      }
      if (src.type === 'ts') {
        const mpegts = (await import('mpegts.js')).default as any;
        if (s !== this.session) return;
        if (mpegts.isSupported() && mpegts.getFeatureList().mseLivePlayback) return this.withMpegts(mpegts, src, s);
        return this.native(src);
      }
      return this.native(src);
    } catch (_) {
      // Échec de chargement du module (réseau) : traité comme une coupure.
      if (s === this.session) this.scheduleRetry('network');
    }
  }

  private native(src: Source) {
    const v = this.video!;
    this.nativeActive = true;
    v.src = src.url;
    if (src.startAt) {
      const at = src.startAt;
      const onMeta = () => {
        v.removeEventListener('loadedmetadata', onMeta);
        try {
          v.currentTime = at;
        } catch (_) {
          /* ignore */
        }
      };
      v.addEventListener('loadedmetadata', onMeta);
    }
    this.tryPlay();
  }

  /** Lecture automatique refusée (téléphone, onglet sans interaction) : on attend un appui. */
  private tryPlay() {
    const v = this.video;
    if (!v) return;
    v.play().catch((e: Error) => {
      if (e && e.name === 'NotAllowedError') {
        this.clearStall();
        this.set('paused');
      }
    });
  }

  private withHls(Hls: any, src: Source, s: number) {
    const v = this.video!;
    // Config allégée pour TV à peu de RAM : petits tampons, worker si disponible.
    const hls = new Hls({
      enableWorker: typeof Worker !== 'undefined',
      maxBufferLength: 20,
      maxMaxBufferLength: 40,
      maxBufferSize: 30 * 1000 * 1000,
      backBufferLength: src.live ? 10 : 30,
      liveSyncDurationCount: 3,
      // Conversion en cours : le début est la position voulue, pas le « direct ».
      startPosition: src.remux ? 0 : src.startAt || -1,
      // La première réponse peut attendre que le proxy se réveille et ouvre le fichier.
      manifestLoadingTimeOut: src.remux ? 70_000 : 15_000,
      levelLoadingTimeOut: src.remux ? 30_000 : 15_000,
      liveDurationInfinity: !!src.remux,
      capLevelToPlayerSize: true,
      // Les nouvelles tentatives du manifeste sont gérées par scheduleRetry (qui peut changer de format).
      manifestLoadingMaxRetry: 0,
      levelLoadingMaxRetry: 3,
      startFragPrefetch: true,
      fragLoadingMaxRetry: 4,
    });
    this.hls = hls;
    let mediaRecoveries = 0;
    hls.on(Hls.Events.ERROR, (_e: unknown, d: any) => {
      if (s !== this.session || !d.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
        mediaRecoveries++;
        if (mediaRecoveries === 2) hls.swapAudioCodec();
        hls.recoverMediaError();
        return;
      }
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
        // 404 sur le manifeste : la chaîne n'existe sans doute plus. Un 403 ou un 5xx est souvent passager.
        const code = d.response && d.response.code;
        this.scheduleRetry('network', (code === 404 || code === 410) && String(d.details).indexOf('manifest') >= 0);
      } else if (src.live) this.scheduleRetry('media');
      else this.fail('media');
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (s === this.session) this.tryPlay();
    });
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      this.applyLangPrefs();
      this.emit();
    });
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      this.applyLangPrefs();
      this.emit();
    });
    hls.loadSource(src.url);
    hls.attachMedia(v);
  }

  private withMpegts(mpegts: any, src: Source, s: number) {
    const v = this.video!;
    const p = mpegts.createPlayer(
      { type: 'mpegts', isLive: src.live, url: src.url },
      {
        enableWorker: false,
        enableStashBuffer: false,
        liveBufferLatencyChasing: src.live,
        liveBufferLatencyMaxLatency: 6,
        liveBufferLatencyMinRemain: 1.5,
        autoCleanupSourceBuffer: true,
      },
    );
    this.mts = p;
    p.on(mpegts.Events.ERROR, (type: string) => {
      if (s !== this.session) return;
      if (type === mpegts.ErrorTypes.NETWORK_ERROR || src.live) this.scheduleRetry('network');
      else this.fail('media');
    });
    p.attachMediaElement(v);
    p.load();
    const r = p.play();
    if (r && r.catch) r.catch(() => undefined);
  }

  /* ------------------------------------------------------- Erreurs */

  private onNativeError() {
    const v = this.video;
    // Les erreurs de l'élément ne concernent que la lecture native ; hls.js / mpegts gèrent les leurs.
    if (!v || !v.error || !this.nativeActive || !this.src) return;
    const code = v.error.code;
    if (code === 4) {
      // MEDIA_ERR_SRC_NOT_SUPPORTED : souvent une origine injoignable, sinon un format non lu.
      if (this.src.live) this.scheduleRetry('network');
      else this.fail('unsupported');
    } else if (code === 2) this.scheduleRetry('network');
    else this.fail('media');
  }

  private scheduleRetry(kind: PlayerError['kind'], gone = false) {
    const budget = gone ? GONE_RETRIES : RETRY_DELAYS.length;
    if (this.silent || this.retries >= budget) return this.fail(kind);
    const delay = RETRY_DELAYS[this.retries++]!;
    this.reconnect = { attempt: this.retries, max: budget };
    // VOD : on reprendra à la même position.
    const v = this.video;
    if (this.src && this.src.remux) {
      if (v && v.currentTime > 1) this.remuxOffset = Math.floor(this.position());
    } else if (this.src && !this.src.live && v && v.currentTime > 1) this.src = { ...this.src, startAt: v.currentTime };
    this.teardown();
    this.set('loading');
    this.retryTimer = window.setTimeout(() => this.retryAttempt(), delay);
  }

  /** Une fois sur deux, le direct essaie l'autre format (certains fournisseurs n'en servent qu'un de façon fiable). */
  private retryAttempt() {
    const src = this.src;
    if (!src) return;
    if (!src.live || !src.alternate || this.retries % 2 === 1) return void this.start();
    const session = this.session;
    src
      .alternate()
      .then((n) => {
        if (session !== this.session || this.src !== src) return;
        this.src = { ...src, url: n.url, type: n.type };
        this.start();
      })
      .catch(() => {
        if (session === this.session && this.src === src) this.start();
      });
  }

  private canPlayHevc(): boolean {
    const v = this.video;
    const type = 'video/mp4; codecs="hvc1.1.6.L93.B0"';
    if (v && v.canPlayType(type)) return true;
    const ms = (window as any).MediaSource;
    return !!(ms && ms.isTypeSupported && ms.isTypeSupported(type));
  }

  private fail(kind: PlayerError['kind']) {
    this.teardown();
    this.reconnect = null;
    const mkv = kind === 'unsupported' && this.src && this.src.type === 'mkv';
    const remux = this.src && this.src.remux;
    this.error = { kind, message: remux ? MESSAGES.remux : mkv ? MESSAGES.mkv : MESSAGES[kind] };
    this.state = 'error';
    this.silent = false;
    this.emit();
    if (this.src && this.src.live && this.silentLeft > 0) {
      this.silentLeft--;
      this.retryTimer = window.setTimeout(() => {
        this.silent = true;
        this.retryAttempt();
      }, SILENT_RETRY_MS);
    }
  }

  /** Charge hls.js à l'avance : la première chaîne n'attend pas son téléchargement. */
  warm() {
    import('hls.js').catch(() => undefined);
  }

  private armStall() {
    this.clearStall();
    if (!this.src || !this.src.live) return;
    this.stallTimer = window.setTimeout(() => this.scheduleRetry('network'), STALL_MS);
  }

  private clearStall() {
    if (this.stallTimer) window.clearTimeout(this.stallTimer);
    this.stallTimer = 0;
  }

  /** Détruit proprement l'instance en cours (évite les fuites mémoire au zapping). */
  private teardown() {
    this.session++;
    window.clearTimeout(this.retryTimer);
    this.clearStall();
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch (_) {
        /* ignore */
      }
      this.hls = null;
    }
    if (this.mts) {
      try {
        this.mts.pause();
        this.mts.unload();
        this.mts.detachMediaElement();
        this.mts.destroy();
      } catch (_) {
        /* ignore */
      }
      this.mts = null;
    }
    this.nativeActive = false;
    const v = this.video;
    if (v) {
      v.pause();
      v.removeAttribute('src');
      try {
        v.load();
      } catch (_) {
        /* ignore */
      }
    }
  }
}

export const player = new Engine();
