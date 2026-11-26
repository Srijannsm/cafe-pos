"use client";

// Admin → Bills: find any bill, see exactly what was charged and how it was
// paid, and reprint it. This is everyday work (a customer asks for a copy, the
// owner checks a payment), so it works on every plan -- unlike Reports.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../../lib/api";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel, Pill, inputClass } from "../../../components/ui/Field";
import { Tabs } from "../../../components/ui/Tabs";
import { Drawer } from "../../../components/ui/Drawer";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Skeleton } from "../../../components/ui/Skeleton";
import { DateRangeBar, presetRange, type Range } from "../../../components/admin/DateRange";
import { IconExternal, IconPrinter, IconReceipt, IconSearch, IconX } from "../../../components/icons";
import { METHOD_LABEL, dateTime, rs, tableLabel } from "../../../lib/format";

type Status = "all" | "unpaid" | "paid" | "cancelled";
type BillRow = {
  id: number;
  billNumber: number;
  status: string;
  source: "staff" | "qr";
  orderType: string;
  table: string;
  waiter: string | null;
  total: string | null;
  paid: string;
  discount: string | null;
  methods: string[];
  printCount: number;
  createdAt: string;
  paidAt: string | null;
};
type BillDetail = {
  id: number;
  billNumber: number | null;
  status: string;
  createdAt: string;
  subtotal: string | null;
  vatAmount: string | null;
  serviceCharge: string | null;
  discountAmount: string | null;
  discountReason: string | null;
  cancelReason: string | null;
  total: string | null;
  printCount: number;
  notes: string | null;
  table: { tableNumber: string };
  waiter: { name: string } | null;
  orderItems: {
    id: number;
    quantity: number;
    price: string;
    note: string | null;
    voidedAt: string | null;
    voidReason: string | null;
    menuItem: { name: string };
    orderItemModifiers: { modifier: { name: string; priceDelta: string } }[];
  }[];
  payments: { id: number; method: string; amount: string; paidAt: string; reference: string | null }[];
};

const STATUS_PILL: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  paid: { tone: "success", label: "Paid" },
  cancelled: { tone: "danger", label: "Cancelled" },
  billed: { tone: "warning", label: "Unpaid" },
};
const statusPill = (s: string) => STATUS_PILL[s] ?? { tone: "warning" as const, label: "Unpaid" };

export default function BillsPage() {
  const [range, setRange] = useState<Range>(() => presetRange("today"));
  const [status, setStatus] = useState<Status>("all");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState(""); // debounced
  const [rows, setRows] = useState<BillRow[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Wait until typing pauses before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const params = useCallback(
    (before?: number) => {
      const p = new URLSearchParams({ status, tz: String(-new Date().getTimezoneOffset()) });
      // A search looks across all dates: "bill 1042" should be found whenever it was.
      if (!q) {
        p.set("from", range.from);
        p.set("to", range.to);
      } else p.set("q", q);
      if (before) p.set("before", String(before));
      return p.toString();
    },
    [status, q, range],
  );

  useEffect(() => {
    setRows(null);
    setError(false);
    apiFetchJson<{ bills: BillRow[]; nextBefore: number | null }>(`/orders/bills?${params()}`)
      .then((r) => {
        setRows(r.bills);
        setNextBefore(r.nextBefore);
      })
      .catch(() => setError(true));
  }, [params]);

  // "/" focuses search, like most admin tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadMore() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const r = await apiFetchJson<{ bills: BillRow[]; nextBefore: number | null }>(`/orders/bills?${params(nextBefore)}`);
      setRows((prev) => [...(prev ?? []), ...r.bills]);
      setNextBefore(r.nextBefore);
    } finally {
      setLoadingMore(false);
    }
  }

  const paidTotal = (rows ?? []).filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.paid), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Bills" description="Find any bill, check what was charged and how it was paid, and reprint it." />

      <Panel className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Bill no., order no. or table — press / to search"
              className={`${inputClass} w-full pl-9 pr-9`}
              inputMode="search"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint hover:text-ink-primary">
                <IconX className="h-4 w-4" />
              </button>
            )}
          </label>
          <Tabs<Status>
            value={status}
            onChange={setStatus}
            tabs={[
              { value: "all", label: "All" },
              { value: "unpaid", label: "Unpaid" },
              { value: "paid", label: "Paid" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </div>
        {q ? (
          <p className="text-sm text-ink-secondary">Searching all dates for “{q}”.</p>
        ) : (
          <DateRangeBar value={range} onChange={setRange} />
        )}
      </Panel>

      <Panel padded={false} className="overflow-hidden">
        {rows && rows.length > 0 && (
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3 text-sm text-ink-secondary">
            <span>{rows.length}{nextBefore ? "+" : ""} bills</span>
            <span>Paid in this list: <b className="tabular text-ink-primary">{rs(paidTotal)}</b></span>
          </div>
        )}

        {error ? (
          <EmptyState title="Couldn't load bills" description="Check the connection and try again." />
        ) : rows === null ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<IconReceipt className="h-10 w-10" />}
            title={q ? `No bill matches “${q}”` : "No bills in this period"}
            description={q ? "Try the number printed at the top of the bill, or the table number." : "Bills appear here once they're generated at the billing counter."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-canvas text-left text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-5 py-3 font-medium">Bill</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Table</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Served by</th>
                  <th className="hidden px-3 py-3 font-medium sm:table-cell">Payment</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((b) => {
                  const pill = statusPill(b.status);
                  return (
                    <tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer transition hover:bg-surface-hover">
                      <td className="px-5 py-3">
                        <span className="font-semibold text-ink-primary">#{b.billNumber}</span>
                        <span className="ml-2 text-xs text-ink-faint">order {b.id}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-secondary">{dateTime(b.paidAt ?? b.createdAt)}</td>
                      <td className="px-3 py-3 text-ink-secondary">{b.orderType === "takeaway" ? "Takeaway" : tableLabel(b.table)}</td>
                      <td className="hidden px-3 py-3 text-ink-secondary md:table-cell">{b.waiter ?? "—"}</td>
                      <td className="hidden px-3 py-3 text-ink-secondary sm:table-cell">{b.methods.map((m) => METHOD_LABEL[m] ?? m).join(" + ") || "—"}</td>
                      <td className="px-3 py-3"><Pill tone={pill.tone}>{pill.label}</Pill></td>
                      <td className="tabular px-5 py-3 text-right font-semibold text-ink-primary">
                        {b.status === "cancelled" ? <span className="text-ink-faint line-through">{rs(b.total)}</span> : rs(b.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {nextBefore && rows && (
          <div className="border-t border-border-subtle p-4 text-center">
            <Button variant="secondary" loading={loadingMore} onClick={loadMore}>Load more</Button>
          </div>
        )}
      </Panel>

      <BillDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function BillDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    setBill(null);
    setFailed(false);
    apiFetchJson<BillDetail>(`/orders/${id}`).then(setBill).catch(() => setFailed(true));
  }, [id]);

  const live = bill?.orderItems.filter((i) => !i.voidedAt) ?? [];
  const voided = bill?.orderItems.filter((i) => i.voidedAt) ?? [];
  const unit = (i: BillDetail["orderItems"][number]) =>
    Number(i.price) + i.orderItemModifiers.reduce((s, m) => s + Number(m.modifier.priceDelta), 0);
  const paid = bill?.payments.reduce((s, p) => s + Number(p.amount), 0) ?? 0;
  const pill = bill ? statusPill(bill.status) : null;

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      title={bill?.billNumber ? `Bill #${bill.billNumber}` : "Bill"}
      subtitle={bill ? `Order ${bill.id} · ${tableLabel(bill.table.tableNumber)} · ${dateTime(bill.createdAt)}` : undefined}
      footer={
        bill && (
          <div className="flex gap-2">
            <Link href={`/billing/${bill.id}/receipt`} target="_blank" className="flex-1">
              <Button className="w-full" icon={<IconPrinter />}>{bill.printCount > 0 ? "Reprint copy" : "Print bill"}</Button>
            </Link>
            {bill.status !== "paid" && bill.status !== "cancelled" && (
              <Link href={`/billing/${bill.id}`} target="_blank">
                <Button variant="secondary" icon={<IconExternal />}>Take payment</Button>
              </Link>
            )}
          </div>
        )
      }
    >
      {failed ? (
        <EmptyState title="Couldn't open this bill" />
      ) : !bill ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : (
        <div className="space-y-6 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
            {bill.waiter && <span className="text-ink-secondary">Served by {bill.waiter.name}</span>}
            {bill.printCount > 0 && <span className="text-ink-faint">· printed {bill.printCount}×</span>}
          </div>

          {bill.cancelReason && (
            <p className="rounded-lg bg-status-danger-tint px-3 py-2 text-status-danger-ink">Cancelled: {bill.cancelReason}</p>
          )}

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Items</h3>
            <ul className="divide-y divide-border-subtle">
              {live.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <div>
                    <p className="text-ink-primary">{i.quantity} × {i.menuItem.name}</p>
                    {i.orderItemModifiers.length > 0 && <p className="text-xs text-ink-faint">+ {i.orderItemModifiers.map((m) => m.modifier.name).join(", ")}</p>}
                    {i.note && <p className="text-xs text-ink-faint">“{i.note}”</p>}
                  </div>
                  <span className="tabular text-ink-primary">{rs(unit(i) * i.quantity)}</span>
                </li>
              ))}
            </ul>
            {voided.length > 0 && (
              <div className="mt-3 rounded-lg bg-surface-canvas p-3">
                <p className="mb-1 text-xs font-medium text-ink-secondary">Voided before billing</p>
                {voided.map((i) => (
                  <p key={i.id} className="flex justify-between text-xs text-ink-faint">
                    <span className="line-through">{i.quantity} × {i.menuItem.name}</span>
                    <span>{i.voidReason}</span>
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-1.5 border-t border-border-subtle pt-4">
            <Row label="Subtotal" value={bill.subtotal} />
            {Number(bill.discountAmount) > 0 && <Row label={`Discount${bill.discountReason ? ` (${bill.discountReason})` : ""}`} value={bill.discountAmount} minus />}
            {Number(bill.serviceCharge) > 0 && <Row label="Service charge" value={bill.serviceCharge} />}
            {Number(bill.vatAmount) > 0 && <Row label="VAT" value={bill.vatAmount} />}
            <div className="flex justify-between pt-1 text-base font-semibold text-ink-primary">
              <span>Total</span><span className="tabular">{rs(bill.total)}</span>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Payments</h3>
            {bill.payments.length === 0 ? (
              <p className="text-ink-faint">No payment taken yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex justify-between">
                    <span className="text-ink-secondary">
                      {METHOD_LABEL[p.method] ?? p.method} · {dateTime(p.paidAt)}
                      {p.reference && <span className="text-ink-faint"> · ref {p.reference}</span>}
                    </span>
                    <span className="tabular text-ink-primary">{rs(p.amount)}</span>
                  </li>
                ))}
                {bill.status !== "paid" && bill.total && paid < Number(bill.total) && (
                  <li className="flex justify-between font-medium text-status-warning-ink">
                    <span>Still due</span><span className="tabular">{rs(Number(bill.total) - paid)}</span>
                  </li>
                )}
              </ul>
            )}
          </section>

          {bill.notes && <p className="rounded-lg bg-surface-canvas p-3 text-ink-secondary">Note: {bill.notes}</p>}
        </div>
      )}
    </Drawer>
  );
}

function Row({ label, value, minus = false }: { label: string; value: string | null; minus?: boolean }) {
  if (value == null) return null;
  return (
    <div className="flex justify-between text-ink-secondary">
      <span>{label}</span><span className="tabular">{minus ? "−" : ""}{rs(value)}</span>
    </div>
  );
}
