import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../app-context';
import { useKeyHandler } from '../nav/hooks';
import { mapKey } from '../nav/keys';
import { ScreenHeader } from '../components/ScreenHeader';

interface Row {
  n: number;
  keyCode: number;
  key: string;
  code: string;
  action: string;
}

/**
 * Écran caché de calibration : affiche keyCode / key / code de chaque touche,
 * y compris celles que le mapping ne connaît pas. Retour doit être pressé
 * deux fois (pour pouvoir aussi relever le code de la touche Retour).
 */
export function KeyDebugScreen() {
  const app = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [lastBack, setLastBack] = useState(0);

  useEffect(() => {
    let n = 0;
    const onKey = (e: KeyboardEvent) => {
      const m = mapKey(e);
      const row: Row = {
        n: ++n,
        keyCode: e.keyCode || e.which,
        key: String(e.key),
        code: String(e.code),
        action: m ? m.action + (m.digit !== undefined ? ' ' + m.digit : '') : '— (non mappée)',
      };
      setRows((r) => [row].concat(r.slice(0, 11)));
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  useKeyHandler((k) => {
    if (k.action === 'back') {
      const now = Date.now();
      if (now - lastBack < 1500) app.back();
      else setLastBack(now);
    }
    return true; // capture tout : aucune navigation pendant la calibration
  });

  return (
    <div class="screen">
      <ScreenHeader title="Debug touches" backHint="× 2 pour quitter" />
      <p class="hero-sub">Appuyez sur les touches de la télécommande.</p>
      <table class="key-table">
        <thead>
          <tr>
            <th>#</th>
            <th>keyCode</th>
            <th>key</th>
            <th>code</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td>{r.n}</td>
              <td class="mono strong">{r.keyCode}</td>
              <td class="mono">{r.key}</td>
              <td class="mono">{r.code}</td>
              <td>{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
