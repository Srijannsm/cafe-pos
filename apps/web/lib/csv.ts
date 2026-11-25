// Every report can be downloaded as CSV -- it opens in Excel and Google
// Sheets, which is what the cafe's accountant actually uses.
export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: { key: string; label: string }[]) {
  if (rows.length === 0) return;
  const cols = columns ?? Object.keys(rows[0]!).map((k) => ({ key: k, label: k }));
  const esc = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => esc(c.label)).join(","), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(","))];
  // BOM so Excel opens UTF-8 (Nepali names) correctly.
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
