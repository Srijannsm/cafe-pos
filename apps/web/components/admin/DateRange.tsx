"use client";

import { addDays, localDay } from "../../lib/format";
import { inputClass } from "../ui/Field";

export type Range = { from: string; to: string; preset: string };

// Nepal's fiscal year starts 1 Shrawan (~mid-July).
function fiscalYearStart(today: string) {
  const y = Number(today.slice(0, 4));
  const start = `${y}-07-17`;
  return today >= start ? start : `${y - 1}-07-17`;
}

export function presetRange(preset: string): Range {
  const t = localDay();
  const monthStart = `${t.slice(0, 7)}-01`;
  switch (preset) {
    case "today": return { from: t, to: t, preset };
    case "yesterday": return { from: addDays(t, -1), to: addDays(t, -1), preset };
    case "7d": return { from: addDays(t, -6), to: t, preset };
    case "30d": return { from: addDays(t, -29), to: t, preset };
    case "month": return { from: monthStart, to: t, preset };
    case "lastmonth": {
      const end = addDays(monthStart, -1);
      return { from: `${end.slice(0, 7)}-01`, to: end, preset };
    }
    case "fy": return { from: fiscalYearStart(t), to: t, preset };
    default: return { from: addDays(t, -6), to: t, preset: "7d" };
  }
}

const PRESETS = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 days"], ["30d", "30 days"],
  ["month", "This month"], ["lastmonth", "Last month"], ["fy", "This fiscal year"],
] as const;

export function DateRangeBar({ value, onChange, children }: { value: Range; onChange: (r: Range) => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Date range"
        className={`${inputClass} w-auto`}
        value={value.preset}
        onChange={(e) => onChange(e.target.value === "custom" ? { ...value, preset: "custom" } : presetRange(e.target.value))}
      >
        {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        <option value="custom">Custom…</option>
      </select>
      {value.preset === "custom" && (
        <>
          <input type="date" aria-label="From" className={`${inputClass} w-auto`} value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-ink-faint">→</span>
          <input type="date" aria-label="To" className={`${inputClass} w-auto`} value={value.to} min={value.from} max={localDay()} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      )}
      {children}
    </div>
  );
}
