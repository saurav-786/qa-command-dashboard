const IST = "Asia/Kolkata";

export function formatIst(
  isoUtc: string | null | undefined,
  opts: { withSeconds?: boolean } = {},
): string {
  if (!isoUtc) return "—";
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return "—";
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    second: opts.withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(d);
  return `${date} ${time} IST`;
}

export function clockIst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export function durationMs(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start) return null;
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, b - a);
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
