'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlayResponse } from '@iptv/shared';

/* eslint-disable @typescript-eslint/no-explicit-any -- hls.js / mpegts.js chargés dynamiquement */

/**
 * Lecteur de test du dashboard : vérifie qu'un contenu est lisible, avec la
 * même résolution d'URL (et le même proxy de flux) que la TV.
 */
export function TestPlayButton({ playlistId, kind, id, name }: { playlistId: string; kind: 'live' | 'vod'; id: number; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg">
        Tester
      </button>
      {open && <PlayerModal playlistId={playlistId} kind={kind} id={id} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function PlayerModal({
  playlistId,
  kind,
  id,
  name,
  onClose,
}: {
  playlistId: string;
  kind: 'live' | 'vod';
  id: number;
  name: string;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>({ text: 'Chargement…' });

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    const v = video.current!;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const fail = (text: string) => !cancelled && setStatus({ text, error: true });

    (async () => {
      const res = await fetch(`/api/play?playlist=${playlistId}&kind=${kind}&id=${id}`);
      if (!res.ok) return fail('Lecture impossible : ' + ((await res.json().catch(() => ({}))) as { error?: string }).error);
      const p = (await res.json()) as PlayResponse;
      if (cancelled) return;
      const how = p.proxied ? 'via le proxy de flux' : 'en direct depuis la source';
      if (p.warning === 'mixed_content' && location.protocol === 'https:') {
        return fail('Flux en http:// sans proxy configuré (STREAM_PROXY_URL) : bloqué par le navigateur.');
      }
      v.onplaying = () => setStatus({ text: `Lecture OK (${p.type.toUpperCase()}, ${how})` });
      v.onerror = () => fail(p.type === 'mkv' ? 'Format MKV non lu par ce navigateur.' : 'Le flux ne répond pas ou est illisible.');

      if (p.type === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
        const Hls = (await import('hls.js')).default as any;
        if (cancelled) return;
        const hls = new Hls({ maxBufferLength: 20 });
        hls.on(Hls.Events.ERROR, (_: unknown, d: any) => d.fatal && fail('Erreur HLS : ' + d.details));
        hls.loadSource(p.url);
        hls.attachMedia(v);
        cleanup = () => hls.destroy();
      } else if (p.type === 'ts') {
        const mpegts = (await import('mpegts.js')).default as any;
        if (cancelled) return;
        const pl = mpegts.createPlayer({ type: 'mpegts', isLive: p.live, url: p.url });
        pl.on(mpegts.Events.ERROR, () => fail('Le flux MPEG-TS ne répond pas ou est illisible.'));
        pl.attachMediaElement(v);
        pl.load();
        cleanup = () => pl.destroy();
      } else {
        v.src = p.url;
      }
      v.play().catch(() => undefined);
    })().catch(() => fail('Lecture impossible.'));

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      cleanup();
      v.removeAttribute('src');
      v.load();
    };
  }, [playlistId, kind, id, onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={'Test : ' + name} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface" onClick={(e) => e.stopPropagation()}>
        <video ref={video} controls playsInline className="aspect-video w-full bg-black" />
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{name}</p>
            <p className={'text-sm ' + (status.error ? 'text-danger' : 'text-muted')}>{status.text}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost h-9">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
