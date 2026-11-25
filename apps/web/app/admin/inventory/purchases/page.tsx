"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { Button } from "../../../../components/ui/Button";
import { Panel } from "../../../../components/ui/Field";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { IconTruck, IconDownload } from "../../../../components/icons";
import { PurchaseModal, type StockItem, type Supplier } from "../../../../components/admin/inventory";
import { DateRangeBar, presetRange, type Range } from "../../../../components/admin/DateRange";
import { downloadCsv } from "../../../../lib/csv";
import { num, rs, shortDate } from "../../../../lib/format";

type Purchase = {
  id: number;
  purchasedAt: string;
  billRef: string | null;
  total: string;
  note: string | null;
  supplier: Supplier | null;
  lines: { id: number; quantity: string; unitCost: string; lineTotal: string; stockItem: { name: string; unit: string } }[];
};

export default function PurchasesPage() {
  const { showToast, toastHost } = useToast();
  const [range, setRange] = useState<Range>(presetRange("30d"));
  const [rows, setRows] = useState<Purchase[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, i, s] = await Promise.all([
        apiFetchJson<Purchase[]>(`/inventory/purchases?from=${range.from}&to=${range.to}`),
        apiFetchJson<StockItem[]>("/inventory/items"),
        apiFetchJson<Supplier[]>("/inventory/suppliers"),
      ]);
      setRows(p);
      setItems(i);
      setSuppliers(s);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, showToast]);
  useEffect(() => { load(); }, [load]);

  const total = rows.reduce((s, r) => s + Number(r.total), 0);

  return (
    <div>
      {toastHost}
      <PageHeader
        title="Purchases"
        description="Every delivery you record here adds to stock and updates average cost."
        actions={<Button icon={<IconTruck />} onClick={() => setOpen(true)}>Record purchase</Button>}
      />
      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
          <DateRangeBar value={range} onChange={setRange} />
          <div className="flex items-center gap-3">
            <p className="text-sm text-ink-secondary">{rows.length} purchases · <span className="tabular font-semibold text-ink-primary">{rs(total)}</span></p>
            <Button size="small" variant="secondary" icon={<IconDownload />} disabled={!rows.length} onClick={() =>
              downloadCsv(`purchases-${range.from}-to-${range.to}`, rows.flatMap((r) => r.lines.map((l) => ({
                date: r.purchasedAt.slice(0, 10), supplier: r.supplier?.name ?? "", bill: r.billRef ?? "", item: l.stockItem.name,
                quantity: Number(l.quantity), unit: l.stockItem.unit, unitCost: Number(l.unitCost), lineTotal: Number(l.lineTotal),
              }))))
            }>CSV</Button>
          </div>
        </div>
        {loading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="No purchases in this period" description="Record deliveries as they arrive — it keeps stock and costs accurate." className="py-14" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="hidden px-4 py-3 md:table-cell">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer border-b border-border-subtle hover:bg-surface-canvas" onClick={() => setExpanded((e) => (e === r.id ? null : r.id))}>
                    <td className="px-4 py-3 text-ink-secondary">{shortDate(r.purchasedAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-primary">{r.supplier?.name ?? "—"}</p>
                      {r.billRef && <p className="text-xs text-ink-faint">Bill {r.billRef}</p>}
                    </td>
                    <td className="hidden max-w-md truncate px-4 py-3 text-ink-secondary md:table-cell">{r.lines.map((l) => l.stockItem.name).join(", ")}</td>
                    <td className="tabular px-4 py-3 text-right font-medium text-ink-primary">{rs(r.total)}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="border-b border-border-subtle bg-surface-canvas">
                      <td colSpan={4} className="px-4 py-3">
                        <div className="space-y-1">
                          {r.lines.map((l) => (
                            <div key={l.id} className="flex justify-between text-sm">
                              <span className="text-ink-secondary">{l.stockItem.name} · {num(l.quantity)} {l.stockItem.unit} @ {rs(l.unitCost, { decimals: true })}</span>
                              <span className="tabular text-ink-primary">{rs(l.lineTotal)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <PurchaseModal open={open} items={items} suppliers={suppliers} onClose={() => setOpen(false)} onSaved={(m) => { showToast(m); setOpen(false); load(); }} onError={(m) => showToast(m, "error")} />
    </div>
  );
}
