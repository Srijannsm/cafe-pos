"use client";

import { useState } from "react";
import { rs } from "../../lib/format";

// Small dependency-free charts. Brand colour for the data, greys for
// everything else -- one accent, so the eye goes to the numbers.
export function BarChart({ data, height = 220, format = rs }: { data: { label: string; value: number; sub?: string }[]; height?: number; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = data.length > 20 ? Math.ceil(data.length / 10) : 1;
  return (
    <div>
      <div className="relative flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className={`w-full rounded-t-[4px] transition ${hover === i ? "bg-brand-strong" : "bg-brand"} ${d.value === 0 ? "opacity-20" : ""}`} style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-primary px-2.5 py-1.5 text-xs text-white shadow-lg">
                <p className="font-medium">{format(d.value)}</p>
                <p className="text-white/70">{d.label}{d.sub ? ` · ${d.sub}` : ""}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px] text-[10px] text-ink-faint">
        {data.map((d, i) => <span key={d.label} className="flex-1 overflow-visible whitespace-nowrap text-center">{i % step === 0 ? d.label.slice(5) || d.label : ""}</span>)}
      </div>
    </div>
  );
}

export function HBars({ rows, format = rs }: { rows: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-ink-secondary">{r.label}{r.sub && <span className="ml-1.5 text-xs text-ink-faint">{r.sub}</span>}</span>
            <span className="tabular shrink-0 font-medium text-ink-primary">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-sunken"><div className="h-2 rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Busy hours: weekday x hour, darker = more bills. Helps plan staff. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => grid.some((row) => (row[h] ?? 0) > 0) || (h >= 8 && h <= 22));
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px]">
        <thead>
          <tr><th />{hours.map((h) => <th key={h} className="px-0.5 pb-1 font-normal text-ink-faint">{h % 12 || 12}{h < 12 ? "a" : "p"}</th>)}</tr>
        </thead>
        <tbody>
          {grid.map((row, d) => (
            <tr key={d}>
              <td className="pr-2 text-ink-faint">{DAYS[d]}</td>
              {hours.map((h) => {
                const v = row[h] ?? 0;
                return (
                  <td key={h} className="p-0.5">
                    <div title={`${DAYS[d]} ${h}:00 — ${v} bills`} className="h-6 w-7 rounded-[4px]" style={{ background: v ? `color-mix(in srgb, var(--brand) ${15 + (v / max) * 85}%, transparent)` : "var(--surface-sunken)" }} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
