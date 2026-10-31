/**
 * Adresses IP privées, réservées ou de bouclage : jamais joignables à partir d'une
 * URL fournie par un utilisateur ou par une playlist (protection SSRF).
 * Utilisé par l'API (apps/web) et par le proxy de flux.
 */

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function v4Private(ip: string): boolean {
  const m = V4.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateIp(ip: string): boolean {
  if (V4.test(ip)) return v4Private(ip);
  const l = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
  if (mapped) return v4Private(mapped[1]!);
  return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

export function isLocalHostname(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local');
}
