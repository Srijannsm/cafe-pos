"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { useCafeSettings } from "../../../../lib/CafeSettingsContext";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal";
import { Panel, Pill } from "../../../../components/ui/Field";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { IconPrinter } from "../../../../components/icons";
import { ZReport, type ShiftSummary } from "../../../../components/admin/cash";
import { DateRangeBar, presetRange, type Range } from "../../../../components/admin/DateRange";
import { dateTime, rs } from "../../../../lib/format";

export default function ShiftHistoryPage() {
  const { showToast, toastHost } = useToast();
  const { settings } = useCafeSettings();
  const [range, setRange] = useState<Range>(presetRange("30d"));
  const [rows, setRows] = useState<ShiftSummary[]>([]);
  const [view, setView] = useState<ShiftSummary | null>(null);

  const load = useCallback(() => {
    apiFetchJson<ShiftSummary[]>(`/shifts?from=${range.from}&to=${range.to}`).then(setRows).catch((e) => showToast(e.message, "error"));
  }, [range.from, range.to, showToast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {toastHost}
      <PageHeader title="Shift history" description="Every drawer count, with the difference between expected and counted cash." />
      <div className="mb-4"><DateRangeBar value={range} onChange={setRange} /></div>
      <Panel padded={false}>
        {rows.length === 0 ? <EmptyState title="No shifts in this period" className="py-14" /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Shift</th><th className="hidden px-4 py-3 md:table-cell">Staff</th>
                <th className="px-4 py-3 text-right">Sales</th><th className="hidden px-4 py-3 text-right sm:table-cell">Expected</th>
                <th className="px-4 py-3 text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const d = s.difference == null ? null : Number(s.difference);
                return (
                  <tr key={s.id} className="cursor-pointer border-b border-border-subtle last:border-0 hover:bg-surface-canvas" onClick={() => setView(s)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-primary">{dateTime(s.openedAt)}</p>
                      <p className="text-xs text-ink-faint">{s.closedAt ? `to ${dateTime(s.closedAt)}` : "Still open"}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-ink-secondary md:table-cell">{s.openedBy}{s.closedBy && s.closedBy !== s.openedBy ? ` → ${s.closedBy}` : ""}</td>
                    <td className="tabular px-4 py-3 text-right">{rs(s.totalSales)}</td>
                    <td className="tabular hidden px-4 py-3 text-right text-ink-secondary sm:table-cell">{rs(s.expectedCash)}</td>
                    <td className="px-4 py-3 text-right">
                      {d == null ? <Pill tone="info">Open</Pill> : Math.abs(d) < 1 ? <Pill tone="success">Exact</Pill> : <Pill tone={d < 0 ? "danger" : "warning"}>{d > 0 ? "+" : ""}{rs(d)}</Pill>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <Modal open={!!view} onClose={() => setView(null)} title={`Shift #${view?.id ?? ""}`} size="sm">
        {view && (
          <>
            <ZReport s={view} cafeName={settings?.name ?? "Cafe"} />
            <div className="mt-4 flex justify-end print:hidden"><Button variant="secondary" icon={<IconPrinter />} onClick={() => window.print()}>Print</Button></div>
          </>
        )}
      </Modal>
    </div>
  );
}
