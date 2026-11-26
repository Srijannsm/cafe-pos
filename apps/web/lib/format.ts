// Money is always shown as "Rs 1,243" (or "Rs 1,243.50" when there are paisa),
// with tabular figures so columns line up.
export function rs(value: number | string | null | undefined, opts: { decimals?: boolean } = {}) {
  const n = Number(value ?? 0);
  const hasPaisa = Math.round(n * 100) % 100 !== 0;
  const digits = opts.decimals ?? hasPaisa ? 2 : 0;
  return `Rs ${n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function num(value: number | string | null | undefined, max = 2) {
  return Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: max });
}

export function timeAgo(date: string | Date) {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

export function dateTime(date: string | Date) {
  return new Date(date).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function shortDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/** YYYY-MM-DD for the local (cafe) calendar day. */
export function localDay(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return localDay(d);
}

export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  esewa_qr: "eSewa",
  khalti_qr: "Khalti",
  fonepay_qr: "Fonepay",
};

export function assetUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:/.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}${path}`;
}

/** "5m ago" / "2h 10m ago" / "just now". */
export function ago(date: string | Date) {
  const t = timeAgo(date);
  return t === "just now" ? t : `${t} ago`;
}

/**
 * How to show a table. Table numbers are free text: "4", "T5", "Bar-1",
 * "Terrace 2". Only a bare number gets a "T" in front -- prefixing everything
 * turned "T5" into "TT5" on the kitchen screen.
 */
export function tableLabel(tableNumber: string | number | null | undefined) {
  const t = String(tableNumber ?? "").trim();
  return /^\d+$/.test(t) ? `T${t}` : t;
}
