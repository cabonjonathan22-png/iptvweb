const p2 = (n: number) => (n < 10 ? '0' + n : String(n));

export function hhmm(t: number | Date): string {
  const d = typeof t === 'number' ? new Date(t) : t;
  return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

/** 5400 -> « 1 h 30 » ; 2700 -> « 45 min ». */
export function duration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '';
  const m = Math.round(sec / 60);
  return m >= 60 ? Math.floor(m / 60) + ' h ' + p2(m % 60) : m + ' min';
}

/** Position de lecture : « 1:02:05 » / « 12:05 ». */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h ? h + ':' + p2(m) : String(m)) + ':' + p2(s % 60);
}
