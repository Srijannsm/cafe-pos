"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { Button } from "../../../../components/ui/Button";
import { Panel, Pill } from "../../../../components/ui/Field";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { IconPlus, IconDownload } from "../../../../components/icons";
import { CashMoveModal } from "../../../../components/admin/cash";
import { DateRangeBar, presetRange, type Range } from "../../../../components/admin/DateRange";
import { downloadCsv } from "../../../../lib/csv";
import { dateTime, rs } from "../../../../lib/format";

type Row = { id: number; type: string; category: string | null; amount: string; note: string | null; createdAt: string };

export default function ExpensesPage() {
  const { showToast, toastHost } = useToast();
  const [range, setRange] = useState<Range>(presetRange("month"));
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    apiFetchJson<Row[]>(`/shifts/expenses?from=${range.from}&to=${range.to}`).then(setRows).catch((e) => showToast(e.message, "error"));
  }, [range.from, range.to, showToast]);
  useEffect(() => { load(); }, [load]);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.category ?? "Other", (m.get(r.category ?? "Other") ?? 0) + Number(r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      {toastHost}
      <PageHeader title="Expenses" description="Day-to-day spending outside stock purchases." actions={<Button icon={<IconPlus />} onClick={() => setOpen(true)}>Add expense</Button>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateRangeBar value={range} onChange={setRange} />
        <Button size="small" variant="secondary" icon={<IconDownload />} disabled={!rows.length} onClick={() => downloadCsv(`expenses-${range.from}-to-${range.to}`, rows.map((r) => ({ date: r.createdAt, category: r.category ?? "", amount: Number(r.amount), note: r.note ?? "", type: r.type })))}>CSV</Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel padded={false}>
          {rows.length === 0 ? <EmptyState title="No expenses in this period" className="py-14" /> : (
            <ul className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-primary">{r.category ?? "Other"} {r.type === "pay_out" && <Pill>Pay out</Pill>}</p>
                    <p className="truncate text-xs text-ink-faint">{dateTime(r.createdAt)}{r.note ? ` · ${r.note}` : ""}</p>
                  </div>
                  <span className="tabular text-sm font-medium">{rs(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <p className="text-sm text-ink-secondary">Total</p>
          <p className="tabular mb-5 text-2xl font-semibold">{rs(total)}</p>
          <div className="space-y-3">
            {byCat.map(([c, v]) => (
              <div key={c}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-ink-secondary">{c}</span><span className="tabular">{rs(v)}</span></div>
                <div className="h-1.5 rounded-full bg-surface-sunken"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <CashMoveModal open={open} initialType="expense" onClose={() => setOpen(false)} onDone={(m) => { setOpen(false); showToast(m); load(); }} onError={(m) => showToast(m, "error")} />
    </div>
  );
}
