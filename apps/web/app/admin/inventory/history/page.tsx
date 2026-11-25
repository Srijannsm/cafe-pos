"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { Button } from "../../../../components/ui/Button";
import { Panel, Pill, inputClass } from "../../../../components/ui/Field";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { IconDownload } from "../../../../components/icons";
import { DateRangeBar, presetRange, type Range } from "../../../../components/admin/DateRange";
import type { StockItem } from "../../../../components/admin/inventory";
import { downloadCsv } from "../../../../lib/csv";
import { dateTime, num } from "../../../../lib/format";

type Movement = {
  id: number; type: string; quantity: string; unitCost: string | null; reason: string | null; refType: string | null; refId: number | null;
  createdAt: string; stockItem: { name: string; unit: string };
};

const TYPE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  opening: { label: "Opening", tone: "neutral" },
  purchase: { label: "Stock in", tone: "success" },
  sale: { label: "Sold", tone: "info" },
  wastage: { label: "Wasted", tone: "warning" },
  breakage: { label: "Broken", tone: "danger" },
  staff_use: { label: "Staff use", tone: "neutral" },
  adjustment: { label: "Adjusted", tone: "neutral" },
  count: { label: "Count", tone: "warning" },
};

export default function StockHistoryPage() {
  const { showToast, toastHost } = useToast();
  const [range, setRange] = useState<Range>(presetRange("7d"));
  const [items, setItems] = useState<StockItem[]>([]);
  const [itemId, setItemId] = useState<number | "">("");
  const [rows, setRows] = useState<Movement[]>([]);

  useEffect(() => { apiFetchJson<StockItem[]>("/inventory/items").then(setItems).catch(() => {}); }, []);
  const load = useCallback(() => {
    const q = new URLSearchParams({ from: range.from, to: range.to, ...(itemId ? { stockItemId: String(itemId) } : {}) });
    apiFetchJson<Movement[]>(`/inventory/movements?${q}`).then(setRows).catch((e) => showToast(e.message, "error"));
  }, [range.from, range.to, itemId, showToast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {toastHost}
      <PageHeader title="Stock history" description="Every change to stock, newest first. Nothing here can be edited or deleted." />
      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
          <DateRangeBar value={range} onChange={setRange}>
            <select aria-label="Item" className={`${inputClass} w-auto`} value={itemId} onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">All items</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </DateRangeBar>
          <Button className="ml-auto" size="small" variant="secondary" icon={<IconDownload />} disabled={!rows.length} onClick={() =>
            downloadCsv(`stock-history-${range.from}-to-${range.to}`, rows.map((r) => ({
              time: r.createdAt, item: r.stockItem.name, type: TYPE[r.type]?.label ?? r.type, quantity: Number(r.quantity), unit: r.stockItem.unit, note: r.reason ?? "",
            })))
          }>CSV</Button>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Nothing in this period" className="py-14" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">When</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Change</th><th className="hidden px-4 py-3 md:table-cell">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const q = Number(r.quantity);
                const t = TYPE[r.type] ?? { label: r.type, tone: "neutral" as const };
                return (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">{dateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-ink-primary">{r.stockItem.name}</td>
                    <td className="px-4 py-3"><Pill tone={t.tone}>{t.label}</Pill></td>
                    <td className={`tabular px-4 py-3 text-right font-medium ${q >= 0 ? "text-status-success-ink" : "text-status-danger-ink"}`}>
                      {q >= 0 ? "+" : ""}{num(q)} <span className="font-normal text-ink-faint">{r.stockItem.unit}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-ink-faint md:table-cell">{r.reason ?? (r.refType === "order" ? `Bill / order #${r.refId}` : r.refType === "purchase" ? `Purchase #${r.refId}` : "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
