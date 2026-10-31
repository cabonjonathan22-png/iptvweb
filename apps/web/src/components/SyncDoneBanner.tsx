'use client';

import { useEffect, useRef, useState } from 'react';

const nf = new Intl.NumberFormat('fr-FR');

function plural(n: number, one: string, many: string) {
  return nf.format(n) + ' ' + (n > 1 ? many : one);
}

/** Message de fin : s'affiche quand une synchro suivie à l'écran vient de réussir. */
export function SyncDoneBanner({ status, live, vod, series }: { status: string; live: number; vod: number; series: number }) {
  const previous = useRef(status);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const wasSyncing = previous.current === 'syncing';
    previous.current = status;
    if (!wasSyncing || status !== 'ready') return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 10_000);
    return () => clearTimeout(t);
  }, [status]);

  if (!show) return null;
  return (
    <p role="status" className="w-full rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
      ✓ Synchronisation terminée : {plural(live, 'chaîne', 'chaînes')}, {plural(vod, 'film', 'films')} et{' '}
      {plural(series, 'série', 'séries')}. Tout est disponible sur vos TV.
    </p>
  );
}
