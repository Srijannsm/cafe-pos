"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Tabs } from "../../../components/ui/Tabs";
import { Panel, Pill, inputClass } from "../../../components/ui/Field";
import { StatCard, StatSkeleton } from "../../../components/ui/StatCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Skeleton } from "../../../components/ui/Skeleton";
import { IconDownload, IconPrinter, IconReceipt, IconBanknote, IconPercent, IconXCircle, IconBox, IconWallet } from "../../../components/icons";
import { DateRangeBar, presetRange, type Range } from "../../../components/admin/DateRange";
import { BarChart, HBars, Heatmap } from "../../../components/admin/charts";
import { downloadCsv } from "../../../lib/csv";
import { METHOD_LABEL, dateTime, num, rs } from "../../../lib/format";
import type { Category } from "../../../lib/menu-types";
import { orderedCategories } from "../../../lib/menu-types";

type Tab = "overview" | "items" | "staff" | "bills" | "exceptions" | "purchases" | "stock" | "profit";
type Staff = { id: number; name: string; role: string };

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Sales" },
  { value: "items", label: "Items" },
  { value: "staff", label: "Staff" },
  { value: "bills", label: "Bills register" },
  { value: "exceptions", label: "Discounts & voids" },
  { value: "purchases", label: "Purchases & expenses" },
  { value: "stock", label: "Stock" },
  { value: "profit", label: "Profit" },
];

const ACTION_LABEL: Record<string, string> = {
  "discount.apply": "Discount", "discount.remove": "Discount removed", "item.void": "Item voided", "order.cancel": "Order cancelled",
  "bill.reopen": "Bill reopened", "shift.close": "Shift closed", "stock.wastage": "Stock wasted", "stock.breakage": "Breakage",
  "stock.staff_use": "Staff use", "stock.count": "Stock count", "cash.pay_out": "Cash paid out", "cash.expense": "Expense", "cash.pay_in": "Cash in",
};

export default function ReportsPage() {
  const { showToast, toastHost } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>(presetRange("7d"));
  const [staffId, setStaffId] = useState("");
  const [method, setMethod] = useState("");
  const [source, setSource] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [data, setData] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);

  // Restore the tab from the URL so a report can be bookmarked/shared.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.value === t)) setTab(t);
    apiFetchJson<Staff[]>("/users").then(setStaff).catch(() => {});
    apiFetchJson<Category[]>("/menu/categories").then(setCats).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams({ from: range.from, to: range.to, tz: String(-new Date().getTimezoneOffset()) });
    if (staffId) q.set("staffId", staffId);
    if (method) q.set("method", method);
    if (source) q.set("source", source);
    if (categoryId && tab === "items") q.set("categoryId", categoryId);
    if (tab === "overview") q.set("groupBy", groupBy);
    return q.toString();
  }, [range, staffId, method, source, categoryId, groupBy, tab]);

  const load = useCallback(async () => {
    setLoading(true);
    window.history.replaceState(null, "", `?tab=${tab}`);
    try {
      setData(await apiFetchJson(`/reports/${tab === "overview" ? "overview" : tab}?${query}`));
    } catch (e) {
      setData(null);
      showToast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [tab, query, showToast]);
  useEffect(() => { load(); }, [load]);

  const fname = (n: string) => `${n}-${range.from}-to-${range.to}`;
  const showSalesFilters = ["overview", "items", "staff", "bills"].includes(tab);

  return (
    <div>
      {toastHost}
      <PageHeader
        title="Reports"
        description="Filter, compare and export. Days follow your local time."
        actions={<Button variant="secondary" icon={<IconPrinter />} onClick={() => window.print()}>Print</Button>}
      />

      <div className="mb-5 space-y-4 print:hidden">
        <Tabs value={tab} onChange={(t) => { setData(null); setTab(t); }} tabs={TABS} />
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-subtle bg-surface-raised p-3">
          <DateRangeBar value={range} onChange={setRange} />
          {showSalesFilters && (
            <>
              <select aria-label="Staff" className={`${inputClass} w-auto`} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">All staff</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select aria-label="Payment method" className={`${inputClass} w-auto`} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">Any payment</option>
                {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select aria-label="Order source" className={`${inputClass} w-auto`} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Staff + QR</option>
                <option value="staff">Taken by staff</option>
                <option value="qr">QR self-order</option>
              </select>
            </>
          )}
          {tab === "items" && (
            <select aria-label="Category" className={`${inputClass} w-auto`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {orderedCategories(cats).map((c) => <option key={c.id} value={c.id}>{c.depth ? "— " : ""}{c.name}</option>)}
            </select>
          )}
          {tab === "overview" && (
            <select aria-label="Group by" className={`${inputClass} w-auto`} value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
              <option value="day">By day</option><option value="week">By week</option><option value="month">By month</option>
            </select>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}</div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : !data ? (
        <Panel><EmptyState title="Couldn't load this report" action={<Button onClick={load}>Retry</Button>} /></Panel>
      ) : (
        <div className={loading ? "opacity-60 transition" : "transition"}>
          {tab === "overview" && <Overview d={data} csv={() => downloadCsv(fname("sales"), data.series)} />}
          {tab === "items" && <Items d={data} csv={(k: "items" | "categories") => downloadCsv(fname(k), data[k])} />}
          {tab === "staff" && <StaffReport d={data} csv={() => downloadCsv(fname("staff"), data.waiters)} />}
          {tab === "bills" && <Bills rows={data} csv={() => downloadCsv(fname("sales-register"), data)} />}
          {tab === "exceptions" && <Exceptions d={data} csv={() => downloadCsv(fname("discounts-voids"), data.log.map((l: any) => ({ time: l.at, staff: l.actor, action: ACTION_LABEL[l.action] ?? l.action, ref: l.entityId, details: JSON.stringify(l.details) })))} />}
          {tab === "purchases" && <Purchases d={data} csv={(k: string) => downloadCsv(fname(k), data[k])} />}
          {tab === "stock" && <Stock d={data} csv={() => downloadCsv(fname("stock"), data.items)} />}
          {tab === "profit" && <Profit d={data} />}
        </div>
      )}
    </div>
  );
}

function CsvButton({ onClick, label = "CSV" }: { onClick: () => void; label?: string }) {
  return <Button size="small" variant="secondary" icon={<IconDownload />} onClick={onClick} className="print:hidden">{label}</Button>;
}

function Head({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-ink-primary">{title}</h3>{action}</div>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Overview({ d, csv }: { d: any; csv: () => void }) {
  const s = d.summary;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<IconBanknote />} label="Collected" value={rs(s.collected)} caption={`${s.bills} bills`} />
        <StatCard icon={<IconReceipt />} label="Average bill" value={rs(s.avgBill)} />
        <StatCard icon={<IconPercent />} label="Discounts" value={rs(s.discounts)} caption={Number(s.gross) ? `${((Number(s.discounts) / Number(s.gross)) * 100).toFixed(1)}% of gross` : undefined} captionTone={Number(s.discounts) / Math.max(1, Number(s.gross)) > 0.05 ? "warning" : undefined} />
        <StatCard icon={<IconXCircle />} label="Voids" value={rs(s.voidAmount)} caption={`${s.voidCount} items · ${s.cancelledOrders} cancelled orders`} captionTone={s.voidCount ? "warning" : undefined} />
      </div>
      <Panel>
        <Head title="Sales" action={<CsvButton onClick={csv} />} />
        {d.series.length === 0 ? <p className="text-sm text-ink-faint">No sales in this period.</p> : <BarChart data={d.series.map((x: any) => ({ label: x.period, value: Number(x.sales), sub: `${x.bills} bills` }))} />}
      </Panel>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel>
          <Head title="Summary" />
          <dl className="space-y-2 text-sm">
            {[["Gross sales", s.gross], ["− Discounts", s.discounts], ["Net sales", s.net], ["+ Service charge", s.serviceCharge], ["+ VAT", s.vat], ["Collected", s.collected], ["Expenses paid", s.expenses]].map(([l, v]) => (
              <div key={l} className={`flex justify-between ${l === "Net sales" || l === "Collected" ? "border-t border-border-subtle pt-2 font-semibold" : "text-ink-secondary"}`}>
                <dt>{l}</dt><dd className="tabular text-ink-primary">{rs(v)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel>
          <Head title="Payment methods" />
          {d.paymentMethods.length ? <HBars rows={d.paymentMethods.map((m: any) => ({ label: METHOD_LABEL[m.method] ?? m.method, value: Number(m.amount), sub: `${m.count}×` }))} /> : <p className="text-sm text-ink-faint">—</p>}
        </Panel>
        <Panel>
          <Head title="Where orders came from" />
          <HBars rows={[
            ...d.sources.map((x: any) => ({ label: x.source === "qr" ? "QR self-order" : "Taken by staff", value: Number(x.amount) })),
            ...d.orderTypes.map((x: any) => ({ label: x.type === "takeaway" ? "Takeaway" : "Dine-in", value: Number(x.amount) })),
          ]} />
        </Panel>
      </div>
      <Panel>
        <Head title="Busy hours" />
        <p className="-mt-2 mb-4 text-sm text-ink-secondary">Bills paid by weekday and hour — use it to plan staff.</p>
        <Heatmap grid={d.heatmap} />
      </Panel>
    </div>
  );
}

function Table({ cols, rows, empty = "No data in this period." }: { cols: { k: string; l: string; right?: boolean; f?: (v: any, r: any) => React.ReactNode }[]; rows: any[]; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-faint">{empty}</p>;
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
            {cols.map((c) => <th key={c.k} className={`whitespace-nowrap px-5 py-2.5 sm:px-6 ${c.right ? "text-right" : ""}`}>{c.l}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border-subtle last:border-0">
              {cols.map((c) => <td key={c.k} className={`px-5 py-2.5 sm:px-6 ${c.right ? "tabular text-right" : ""}`}>{c.f ? c.f(r[c.k], r) : r[c.k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Items({ d, csv }: { d: any; csv: (k: "items" | "categories") => void }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Panel>
        <Head title="Sales by item" action={<CsvButton onClick={() => csv("items")} />} />
        <Table rows={d.items} cols={[
          { k: "name", l: "Item", f: (v, r) => <><p className="font-medium text-ink-primary">{v}</p><p className="text-xs text-ink-faint">{r.category}</p></> },
          { k: "qty", l: "Sold", right: true },
          { k: "sales", l: "Sales", right: true, f: (v) => rs(v) },
          { k: "share", l: "Share", right: true, f: (v) => `${v}%` },
          { k: "margin", l: "Margin", right: true, f: (v) => (v == null ? <span className="text-ink-faint">—</span> : <Pill tone={Number(v) >= 60 ? "success" : Number(v) >= 35 ? "warning" : "danger"}>{v}%</Pill>) },
        ]} />
      </Panel>
      <Panel>
        <Head title="By category" action={<CsvButton onClick={() => csv("categories")} />} />
        {d.categories.length ? <HBars rows={d.categories.map((c: any) => ({ label: c.name, value: Number(c.sales), sub: `${c.qty} sold` }))} /> : <p className="text-sm text-ink-faint">—</p>}
      </Panel>
    </div>
  );
}

function StaffReport({ d, csv }: { d: any; csv: () => void }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel>
        <Head title="Waiters (who took the order)" action={<CsvButton onClick={csv} />} />
        <Table rows={d.waiters} cols={[
          { k: "name", l: "Name", f: (v) => <span className="font-medium">{v}</span> },
          { k: "bills", l: "Bills", right: true }, { k: "items", l: "Items", right: true },
          { k: "sales", l: "Sales", right: true, f: (v) => rs(v) }, { k: "avgBill", l: "Avg bill", right: true, f: (v) => rs(v) },
        ]} />
      </Panel>
      <Panel>
        <Head title="Cashiers (who took the money)" />
        <Table rows={d.cashiers} cols={[
          { k: "name", l: "Name", f: (v) => <span className="font-medium">{v}</span> },
          { k: "payments", l: "Payments", right: true }, { k: "amount", l: "Amount", right: true, f: (v) => rs(v) },
        ]} />
      </Panel>
    </div>
  );
}

function Bills({ rows, csv }: { rows: any[]; csv: () => void }) {
  const paid = rows.filter((r) => r.status === "paid");
  const sum = (k: string) => paid.reduce((s, r) => s + Number(r[k]), 0);
  return (
    <Panel>
      <Head title={`Sales register · ${paid.length} bills · ${rs(sum("total"))}`} action={<CsvButton onClick={csv} />} />
      <p className="-mt-2 mb-4 text-sm text-ink-secondary">Bill-by-bill list for your accountant. Cancelled orders are listed with their reason.</p>
      <Table rows={rows} cols={[
        { k: "billNumber", l: "Bill", f: (v, r) => <span className="font-medium">{v ? `#${v}` : `Order ${r.orderId}`}</span> },
        { k: "date", l: "Date", f: (v) => <span className="whitespace-nowrap text-ink-secondary">{dateTime(v)}</span> },
        { k: "table", l: "Table" }, { k: "waiter", l: "Staff" },
        { k: "subtotal", l: "Subtotal", right: true, f: (v) => rs(v) },
        { k: "discount", l: "Disc.", right: true, f: (v) => (Number(v) ? `−${rs(v)}` : "—") },
        { k: "vat", l: "VAT", right: true, f: (v) => (Number(v) ? rs(v) : "—") },
        { k: "total", l: "Total", right: true, f: (v) => <span className="font-medium">{rs(v)}</span> },
        { k: "methods", l: "Paid by", f: (v: string) => v.split(" + ").filter(Boolean).map((m) => METHOD_LABEL[m] ?? m).join(" + ") },
        { k: "status", l: "", f: (v, r) => (v === "cancelled" ? <Pill tone="danger">Cancelled{r.note ? ` · ${r.note}` : ""}</Pill> : r.note ? <Pill tone="warning">{r.note}</Pill> : null) },
      ]} />
    </Panel>
  );
}

function detailText(a: string, x: any) {
  if (!x) return "";
  if (a === "item.void") return `${x.quantity}× ${x.item} (${rs(x.amount)}) — ${x.reason}`;
  if (a.startsWith("discount")) return `${x.type === "percent" ? `${x.value}%` : rs(x.value)} — ${x.reason}`;
  if (a === "order.cancel") return x.reason ?? "";
  if (a === "bill.reopen") return `Bill #${x.billNumber} (${rs(x.total)})${x.printCount ? ` after ${x.printCount} print(s)` : ""}`;
  if (a === "shift.close") return `Expected ${rs(x.expected)}, counted ${rs(x.counted)}, diff ${rs(x.difference)}`;
  if (a.startsWith("stock.") && x.item) return `${num(x.quantity)} ${x.unit} ${x.item}${x.reason ? ` — ${x.reason}` : ""}`;
  if (a === "stock.count") return `${x.variances?.length ?? 0} items adjusted`;
  if (a.startsWith("cash.")) return `${rs(x.amount)}${x.category ? ` · ${x.category}` : ""}${x.note ? ` — ${x.note}` : ""}`;
  return "";
}

function Exceptions({ d, csv }: { d: any; csv: () => void }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <Head title="By staff" />
          <Table rows={d.byStaff} empty="Nothing unusual. 👍" cols={[
            { k: "name", l: "Staff", f: (v) => <span className="font-medium">{v}</span> },
            { k: "discounts", l: "Discounts", right: true }, { k: "voids", l: "Voids", right: true },
            { k: "cancels", l: "Cancels", right: true }, { k: "reopens", l: "Reopened", right: true },
          ]} />
        </Panel>
        <Panel>
          <Head title="Discount reasons" />
          {d.discountReasons.length ? <HBars rows={d.discountReasons.map((r: any) => ({ label: r.reason, value: Number(r.amount), sub: `${r.count}×` }))} /> : <p className="text-sm text-ink-faint">No discounts.</p>}
        </Panel>
      </div>
      <Panel>
        <Head title="Activity log" action={<CsvButton onClick={csv} />} />
        <Table rows={d.log} empty="No money-sensitive actions in this period." cols={[
          { k: "at", l: "When", f: (v) => <span className="whitespace-nowrap text-ink-secondary">{dateTime(v)}</span> },
          { k: "actor", l: "Staff" },
          { k: "action", l: "Action", f: (v) => <Pill tone={v.includes("void") || v.includes("cancel") || v === "stock.breakage" ? "danger" : v.includes("discount") || v === "bill.reopen" ? "warning" : "neutral"}>{ACTION_LABEL[v] ?? v}</Pill> },
          { k: "details", l: "Details", f: (v, r) => <span className="text-ink-secondary">{detailText(r.action, v)}</span> },
        ]} />
      </Panel>
    </div>
  );
}

function Purchases({ d, csv }: { d: any; csv: (k: string) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<IconBox />} label="Purchases" value={rs(d.totalPurchases)} caption={`${d.purchases.length} deliveries`} />
        <StatCard icon={<IconWallet />} label="Expenses" value={rs(d.totalExpenses)} caption={`${d.expenses.length} entries`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel><Head title="By supplier" action={<CsvButton onClick={() => csv("bySupplier")} />} />{d.bySupplier.length ? <HBars rows={d.bySupplier.map((x: any) => ({ label: x.name, value: Number(x.total), sub: `${x.count}×` }))} /> : <p className="text-sm text-ink-faint">—</p>}</Panel>
        <Panel><Head title="By item" action={<CsvButton onClick={() => csv("byItem")} />} />{d.byItem.length ? <HBars rows={d.byItem.map((x: any) => ({ label: x.name, value: Number(x.total), sub: `${num(x.qty)} ${x.unit}` }))} /> : <p className="text-sm text-ink-faint">—</p>}</Panel>
        <Panel><Head title="Expenses by category" action={<CsvButton onClick={() => csv("expenses")} />} />{d.expensesByCategory.length ? <HBars rows={d.expensesByCategory.map((x: any) => ({ label: x.category, value: Number(x.amount) }))} /> : <p className="text-sm text-ink-faint">—</p>}</Panel>
      </div>
      <Panel>
        <Head title="Purchases" action={<CsvButton onClick={() => csv("purchases")} />} />
        <Table rows={d.purchases} cols={[
          { k: "date", l: "Date", f: (v) => dateTime(v) }, { k: "supplier", l: "Supplier", f: (v) => v ?? "—" },
          { k: "billRef", l: "Bill", f: (v) => v ?? "—" }, { k: "lines", l: "Items", f: (v) => <span className="text-ink-secondary">{v}</span> },
          { k: "total", l: "Total", right: true, f: (v) => rs(v) },
        ]} />
      </Panel>
    </div>
  );
}

function Stock({ d, csv }: { d: any; csv: () => void }) {
  return (
    <Panel>
      <Head title={`Stock movement · on hand ${rs(d.totalValue)}`} action={<CsvButton onClick={csv} />} />
      <p className="-mt-2 mb-4 text-sm text-ink-secondary">Purchased, used (sales + staff), lost (wasted + broken) and count corrections in the period.</p>
      <Table rows={d.items} cols={[
        { k: "name", l: "Item", f: (v, r) => <><p className="font-medium">{v}</p><p className="text-xs capitalize text-ink-faint">{r.kind}</p></> },
        { k: "purchased", l: "In", right: true, f: (v, r) => `${num(v)} ${r.unit}` },
        { k: "used", l: "Used", right: true, f: (v, r) => `${num(v)} ${r.unit}` },
        { k: "lost", l: "Lost", right: true, f: (v, r) => (Number(v) ? <span className="text-status-danger-ink">{num(v)} {r.unit} · {rs(r.lostValue)}</span> : "—") },
        { k: "countVariance", l: "Count ±", right: true, f: (v) => (Number(v) ? num(v) : "—") },
        { k: "onHand", l: "On hand", right: true, f: (v, r) => <span className="font-medium">{num(v)} {r.unit}</span> },
        { k: "value", l: "Value", right: true, f: (v) => rs(v) },
        { k: "status", l: "", f: (v) => (v === "out" ? <Pill tone="danger">Out</Pill> : v === "low" ? <Pill tone="warning">Low</Pill> : null) },
      ]} />
    </Panel>
  );
}

function Profit({ d }: { d: any }) {
  const rows: [string, string, boolean?][] = [
    ["Net sales", d.netSales], ["− Cost of items sold", d.cogs], ["Gross profit", d.grossProfit, true],
    ["− Stock lost (wasted / broken)", d.stockLosses], ["− Expenses", d.expenses], ["Operating profit", d.operatingProfit, true],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Panel>
        <Head title="Simple profit & loss" />
        <dl className="space-y-3 text-sm">
          {rows.map(([l, v, strong]) => (
            <div key={l} className={`flex justify-between ${strong ? "border-t border-border-subtle pt-3 text-base font-semibold" : "text-ink-secondary"}`}>
              <dt>{l}</dt><dd className={`tabular ${strong && Number(v) < 0 ? "text-status-danger-ink" : "text-ink-primary"}`}>{rs(v)}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel>
        <p className="text-sm font-medium text-ink-primary">How accurate is this?</p>
        <p className="mt-2 text-sm text-ink-secondary">{d.costCoverage}% of the items sold have a known cost (from a recipe or a cost price).</p>
        <div className="mt-3 h-2 rounded-full bg-surface-sunken"><div className="h-2 rounded-full bg-brand" style={{ width: `${d.costCoverage}%` }} /></div>
        {d.costCoverage < 80 && <p className="mt-3 text-sm text-ink-secondary">Add cost prices or recipes in <a className="font-medium text-brand-strong" href="/admin/menu">Menu → Items</a> to make it sharper.</p>}
        <p className="mt-4 text-xs text-ink-faint">Purchases aren't subtracted directly — the cost of what was actually sold is, so buying stock in bulk doesn't make one week look like a loss.</p>
      </Panel>
    </div>
  );
}
