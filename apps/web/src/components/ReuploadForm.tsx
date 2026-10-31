'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { uploadPlaylistFile } from '@/lib/upload-client';

/** Remplacement du fichier d'une playlist « fichier » (relance la synchro). */
export function ReuploadForm({ playlistId }: { playlistId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const file = (e.currentTarget.elements.namedItem('file') as HTMLInputElement).files?.[0];
        if (!file) return;
        setState({ busy: true });
        try {
          await uploadPlaylistFile(playlistId, file);
          setState({ busy: false });
          router.refresh();
        } catch (err) {
          setState({ busy: false, error: (err as Error).message });
        }
      }}
    >
      <input
        name="file"
        type="file"
        required
        accept=".m3u,.m3u8,text/plain"
        aria-label="Nouveau fichier M3U"
        className="min-w-0 flex-1 text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:font-semibold file:text-fg"
      />
      <button className="btn-ghost h-10" disabled={state.busy}>
        {state.busy ? 'Envoi…' : 'Remplacer le fichier'}
      </button>
      {state.error && <p role="alert" className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
