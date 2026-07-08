const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en");

export const fmtCompact = (n: number) => compact.format(n);
export const fmtInt = (n: number) => plain.format(n);
export const fmtPct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

export function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function fmtDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${min}m ${sec.toString().padStart(2, "0")}s`;
}

export function shortDay(day: string): string {
  // "2026-07-08" → "Jul 8"
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}
