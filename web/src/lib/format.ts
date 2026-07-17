// Golf convention: under par shown red, over par dark, even = "E".

export function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}

export function scoreClass(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'sc-none';
  if (n < 0) return 'sc-under';
  if (n > 0) return 'sc-over';
  return 'sc-even';
}

export function fmtToPar(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '–';
  if (typeof v === 'number') return fmtScore(v);
  const s = String(v).trim();
  if (s.toUpperCase() === 'E' || s === '0') return 'E';
  return s.startsWith('-') || s.startsWith('+') ? s : `+${s}`;
}

export function toParNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim().toUpperCase();
  if (s === 'E') return 0;
  const n = Number(s.replace('+', ''));
  return Number.isFinite(n) ? n : null;
}

export function fmtSalary(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return `$${n.toFixed(1)}`;
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–';
  return `$${Math.round(n).toLocaleString()}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function fmtTee(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
}

/** Live one-word status for a golfer: MC / WD / Thru N / F / tee time / position. */
export function golferStatus(g: {
  cut: string;
  roundState: string | null;
  thru: number | null;
  teeTime: string | null;
  position: string | null;
}): string {
  if (g.cut === 'cut') return 'MC';
  if (g.cut === 'wd') return 'WD';
  if (g.roundState === 'in' && g.thru != null) return g.thru >= 18 ? 'F' : `Thru ${g.thru}`;
  if (g.roundState === 'post' || g.thru === 18) return 'F';
  if (g.roundState === 'pre' && g.teeTime) return fmtTee(g.teeTime);
  return g.position ?? '';
}

export const ROUND_LABELS: Record<number, string> = {
  1: 'Thu',
  2: 'Fri',
  3: 'Sat',
  4: 'Sun',
};

export function cutLabel(cut: string): string {
  switch (cut) {
    case 'cut':
      return 'MC';
    case 'wd':
      return 'WD';
    default:
      return '';
  }
}
