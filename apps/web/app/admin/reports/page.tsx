"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { Skeleton } from "../../../components/ui/Skeleton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { IconBarChart, IconReceipt, IconBanknote, IconQrCode, IconPrinter } from "../../../components/icons";

// ─── Print styles ─────────────────────────────────────────────────────────────
const PRINT_STYLE = `
  @media print {
    nav, [data-no-print] { display: none !important; }
    [data-screen-only] { display: none !important; }
    [data-print-only] { display: block !important; }
    body { background: #fff !important; font-family: Arial, sans-serif; color: #000; }
    @page { margin: 1.5cm; size: A4 portrait; }
  }
  [data-print-only] { display: none; }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupBy = "day" | "week" | "month" | "year";
type ReportTab = "sales" | "payments" | "top-selling";
type PrintSection = "all" | "sales" | "payments" | "top-selling";

type Summary = { from: string; to: string; totalRevenue: string; totalOrders: number; avgOrderValue: string };
type PeriodBucket = { period: string; groupBy: GroupBy; revenue: string; orders: number };
type TopItem = { menuItemId: number; name: string; quantitySold: number; revenue: string };
type PaymentMethodRow = { method: string; amount: string; count: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function monthsAgo(n: number) { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); }

function fmtRs(n: number) {
  if (n >= 100000) return `Rs ${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `Rs ${(n / 1000).toFixed(1)}k`;
  return `Rs ${n.toLocaleString()}`;
}
function fmtRsFull(n: number | string) {
  return `Rs ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPeriod(period: string, groupBy: GroupBy): string {
  if (groupBy === "day") {
    const [y, m, d] = period.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (groupBy === "week") return period;
  if (groupBy === "month") {
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  return period;
}

function fmtPeriodFull(period: string, groupBy: GroupBy): string {
  if (groupBy === "day") {
    const [y, m, d] = period.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  if (groupBy === "week") return period;
  if (groupBy === "month") {
    const [y, m] = period.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return period;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", esewa_qr: "eSewa QR", khalti_qr: "Khalti QR", fonepay_qr: "FonePay QR",
};

// ─── Period presets ───────────────────────────────────────────────────────────

type Preset = { label: string; from: () => string; to: () => string; groupBy: GroupBy };

const PRESETS: Preset[] = [
  { label: "Today",          from: () => today(),                                    to: () => today(),   groupBy: "day"   },
  { label: "Yesterday",      from: () => daysAgo(1),                                 to: () => daysAgo(1),groupBy: "day"   },
  { label: "Last 7 days",    from: () => daysAgo(6),                                 to: () => today(),   groupBy: "day"   },
  { label: "Last 30 days",   from: () => daysAgo(29),                                to: () => today(),   groupBy: "day"   },
  { label: "This month",     from: () => today().slice(0, 7) + "-01",                to: () => today(),   groupBy: "week"  },
  { label: "Last 3 months",  from: () => monthsAgo(3),                               to: () => today(),   groupBy: "month" },
  { label: "Last 12 months", from: () => monthsAgo(11),                              to: () => today(),   groupBy: "month" },
  { label: "This year",      from: () => today().slice(0, 4) + "-01-01",             to: () => today(),   groupBy: "month" },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "day", label: "Daily" }, { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" }, { value: "year", label: "Yearly" },
];

// ─── CSV export ───────────────────────────────────────────────────────────────

function downloadCSV(rows: string[], filename: string) {
  const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function csvHeader(title: string, from: string, to: string): string[] {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [title, `Period,${esc(`${from.slice(0, 10)} to ${to.slice(0, 10)}`)}`, `Generated,${esc(new Date().toLocaleString())}`, ""];
}

function exportSalesCSV(summary: Summary, periodData: PeriodBucket[], groupBy: GroupBy) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const totalRevenue = Number(summary.totalRevenue);
  const rows = csvHeader("SALES REPORT", summary.from, summary.to);
  rows.push("SUMMARY");
  rows.push(`Total Revenue,${esc(fmtRsFull(summary.totalRevenue))}`);
  rows.push(`Total Orders Paid,${summary.totalOrders}`);
  rows.push(`Average Order Value,${esc(fmtRsFull(summary.avgOrderValue))}`);
  rows.push("");
  rows.push("REVENUE BY PERIOD");
  rows.push("Period,Orders,Revenue (Rs),Avg / Order (Rs),% of Total");
  for (const b of periodData) {
    const rev = Number(b.revenue);
    const avg = b.orders > 0 ? rev / b.orders : 0;
    const pct = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(1) : "0.0";
    rows.push(`${esc(fmtPeriodFull(b.period, groupBy))},${b.orders},${rev.toFixed(2)},${avg.toFixed(2)},${pct}%`);
  }
  rows.push(`Total,${summary.totalOrders},${totalRevenue.toFixed(2)},${Number(summary.avgOrderValue).toFixed(2)},100.0%`);
  downloadCSV(rows, `sales-report-${today()}.csv`);
}

function exportPaymentsCSV(summary: Summary, paymentMethods: PaymentMethodRow[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const totalPayment = paymentMethods.reduce((s, m) => s + Number(m.amount), 0) || 1;
  const rows = csvHeader("PAYMENT METHODS REPORT", summary.from, summary.to);
  rows.push("Method,Transactions,Amount (Rs),% of Total");
  for (const m of paymentMethods) {
    const amt = Number(m.amount);
    rows.push(`${esc(METHOD_LABELS[m.method] ?? m.method)},${m.count},${amt.toFixed(2)},${((amt / totalPayment) * 100).toFixed(1)}%`);
  }
  rows.push(`Total,${paymentMethods.reduce((s, m) => s + m.count, 0)},${totalPayment.toFixed(2)},100.0%`);
  downloadCSV(rows, `payments-report-${today()}.csv`);
}

function exportTopSellingCSV(summary: Summary, topItems: TopItem[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const topRevTotal = topItems.reduce((s, i) => s + Number(i.revenue), 0) || 1;
  const rows = csvHeader("TOP SELLING ITEMS REPORT", summary.from, summary.to);
  rows.push("Rank,Item,Qty Sold,Revenue (Rs),% of Revenue");
  topItems.forEach((item, idx) => {
    const rev = Number(item.revenue);
    rows.push(`${idx + 1},${esc(item.name)},${item.quantitySold},${rev.toFixed(2)},${((rev / topRevTotal) * 100).toFixed(1)}%`);
  });
  rows.push(`Total,,${topItems.reduce((s, i) => s + i.quantitySold, 0)},${topRevTotal.toFixed(2)},100.0%`);
  downloadCSV(rows, `top-selling-report-${today()}.csv`);
}

function exportAllCSV(summary: Summary, periodData: PeriodBucket[], topItems: TopItem[], paymentMethods: PaymentMethodRow[], groupBy: GroupBy) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const totalRevenue = Number(summary.totalRevenue);
  const totalPayment = paymentMethods.reduce((s, m) => s + Number(m.amount), 0) || 1;
  const topRevTotal = topItems.reduce((s, i) => s + Number(i.revenue), 0) || 1;
  const rows = csvHeader("FULL SALES REPORT", summary.from, summary.to);

  rows.push("SUMMARY");
  rows.push(`Total Revenue,${esc(fmtRsFull(summary.totalRevenue))}`);
  rows.push(`Total Orders Paid,${summary.totalOrders}`);
  rows.push(`Average Order Value,${esc(fmtRsFull(summary.avgOrderValue))}`);
  rows.push("");

  rows.push("REVENUE BY PERIOD");
  rows.push("Period,Orders,Revenue (Rs),Avg / Order (Rs),% of Total");
  for (const b of periodData) {
    const rev = Number(b.revenue);
    const avg = b.orders > 0 ? rev / b.orders : 0;
    const pct = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(1) : "0.0";
    rows.push(`${esc(fmtPeriodFull(b.period, groupBy))},${b.orders},${rev.toFixed(2)},${avg.toFixed(2)},${pct}%`);
  }
  rows.push(`Total,${summary.totalOrders},${totalRevenue.toFixed(2)},${Number(summary.avgOrderValue).toFixed(2)},100.0%`);
  rows.push("");

  rows.push("TOP SELLING ITEMS");
  rows.push("Rank,Item,Qty Sold,Revenue (Rs),% of Revenue");
  topItems.forEach((item, idx) => {
    const rev = Number(item.revenue);
    rows.push(`${idx + 1},${esc(item.name)},${item.quantitySold},${rev.toFixed(2)},${((rev / topRevTotal) * 100).toFixed(1)}%`);
  });
  rows.push(`Total,,${topItems.reduce((s, i) => s + i.quantitySold, 0)},${topRevTotal.toFixed(2)},100.0%`);
  rows.push("");

  rows.push("PAYMENT METHODS");
  rows.push("Method,Transactions,Amount (Rs),% of Total");
  for (const m of paymentMethods) {
    const amt = Number(m.amount);
    rows.push(`${esc(METHOD_LABELS[m.method] ?? m.method)},${m.count},${amt.toFixed(2)},${((amt / totalPayment) * 100).toFixed(1)}%`);
  }
  rows.push(`Total,${paymentMethods.reduce((s, m) => s + m.count, 0)},${totalPayment.toFixed(2)},100.0%`);

  downloadCSV(rows, `full-report-${today()}.csv`);
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────

function RevenueChart({ data, groupBy }: { data: PeriodBucket[]; groupBy: GroupBy }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 720, H = 280, PL = 72, PR = 20, PT = 20, PB = 52;
  const CW = W - PL - PR, CH = H - PT - PB;
  const N = data.length;
  const SLOT = CW / Math.max(N, 1);
  const BAR_W = Math.min(SLOT * 0.6, 48);
  const maxRev = Math.max(1, ...data.map(d => Number(d.revenue)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(p => ({ v: Math.round(maxRev * p), y: PT + CH - p * CH }));

  return (
    <div className="w-full select-none overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full min-w-[400px]"
        style={{ height: "18rem" }} onMouseLeave={() => setHovered(null)}>
        {ticks.map(({ v, y }) => (
          <g key={v}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke={v === 0 ? "#d1d5db" : "#f3f4f6"} strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={PL - 8} y={y + 4} textAnchor="end" fill="#9ca3af" fontSize={10} fontFamily="inherit">{fmtRs(v)}</text>
          </g>
        ))}
        {data.map((b, i) => {
          const rev = Number(b.revenue);
          const barH = Math.max(3, (rev / maxRev) * CH);
          const bx = PL + i * SLOT + (SLOT - BAR_W) / 2;
          const by = PT + CH - barH;
          const cx = PL + i * SLOT + SLOT / 2;
          const hov = hovered === i;
          const label = fmtPeriod(b.period, groupBy);
          return (
            <g key={b.period} onMouseEnter={() => setHovered(i)} style={{ cursor: "default" }}>
              {hov && <rect x={PL + i * SLOT} y={PT} width={SLOT} height={CH} fill="#3b82f6" opacity={0.05} />}
              <rect x={bx} y={by} width={BAR_W} height={barH} rx={4} fill={hov ? "#2563eb" : "#3b82f6"} opacity={hov ? 1 : 0.8} />
              {barH > 20 && (
                <text x={cx} y={by - 5} textAnchor="middle" fill={hov ? "#2563eb" : "#6b7280"} fontSize={9} fontWeight="600" fontFamily="inherit">
                  {fmtRs(Math.round(rev))}
                </text>
              )}
              <text x={cx} y={PT + CH + 16} textAnchor="middle" fill={hov ? "#111827" : "#6b7280"} fontSize={10} fontFamily="inherit">
                {label.length > 9 ? label.slice(0, 8) + "…" : label}
              </text>
              <text x={cx} y={PT + CH + 30} textAnchor="middle" fill="#9ca3af" fontSize={9} fontFamily="inherit">
                {b.orders} ord
              </text>
              {hov && (
                <g>
                  <rect x={Math.min(cx - 58, W - PR - 120)} y={Math.max(by - 52, PT)} width={118} height={44} rx={6} fill="#1e293b" />
                  <text x={Math.min(cx, W - PR - 2)} y={Math.max(by - 52, PT) + 16} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="700" fontFamily="inherit">
                    {fmtRsFull(Math.round(rev))}
                  </text>
                  <text x={Math.min(cx, W - PR - 2)} y={Math.max(by - 52, PT) + 32} textAnchor="middle" fill="#94a3b8" fontSize={10} fontFamily="inherit">
                    {b.orders} order{b.orders === 1 ? "" : "s"} · {fmtPeriod(b.period, groupBy)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Printable report ─────────────────────────────────────────────────────────

function PrintableReport({ summary, periodData, topItems, paymentMethods, groupBy, section }: {
  summary: Summary; periodData: PeriodBucket[]; topItems: TopItem[]; paymentMethods: PaymentMethodRow[]; groupBy: GroupBy; section: PrintSection;
}) {
  const totalRev = Number(summary.totalRevenue);
  const totalPay = paymentMethods.reduce((s, m) => s + Number(m.amount), 0) || 1;
  const topRevTotal = topItems.reduce((s, i) => s + Number(i.revenue), 0) || 1;
  const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "20px" };
  const th: React.CSSProperties = { textAlign: "left", borderBottom: "2px solid #000", padding: "5px 8px", fontWeight: 700, background: "#f3f4f6" };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const td: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #e5e7eb", fontSize: "11px" };
  const tdR: React.CSSProperties = { ...td, textAlign: "right" };
  const tot: React.CSSProperties = { fontWeight: 700, borderTop: "2px solid #000", background: "#f9fafb" };

  const SECTION_TITLES: Record<PrintSection, string> = {
    all: "Full Sales Report",
    sales: "Sales Report",
    payments: "Payment Methods Report",
    "top-selling": "Top Selling Items Report",
  };

  return (
    <div data-print-only style={{ fontFamily: "Arial, sans-serif", color: "#000" }}>
      <div style={{ borderBottom: "2px solid #000", paddingBottom: "10px", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>{SECTION_TITLES[section]}</h1>
        <p style={{ fontSize: "11px", color: "#555", margin: "3px 0 0" }}>Period: {summary.from.slice(0, 10)} → {summary.to.slice(0, 10)}</p>
        <p style={{ fontSize: "10px", color: "#999", margin: "2px 0 0" }}>Generated: {new Date().toLocaleString()}</p>
      </div>

      {(section === "all" || section === "sales") && (
        <>
          <h2 style={{ fontSize: "12px", fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Summary</h2>
          <table style={tbl}><tbody>
            <tr><td style={td}>Total Revenue</td><td style={tdR}>{fmtRsFull(summary.totalRevenue)}</td></tr>
            <tr><td style={td}>Total Orders Paid</td><td style={tdR}>{summary.totalOrders}</td></tr>
            <tr><td style={{ ...td, borderBottom: "2px solid #000" }}>Average Order Value</td><td style={{ ...tdR, borderBottom: "2px solid #000" }}>{fmtRsFull(summary.avgOrderValue)}</td></tr>
          </tbody></table>

          <h2 style={{ fontSize: "12px", fontWeight: 700, margin: "16px 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Revenue by Period</h2>
          <table style={tbl}>
            <thead><tr><th style={th}>Period</th><th style={thR}>Orders</th><th style={thR}>Revenue</th><th style={thR}>Avg / Order</th><th style={thR}>% of Total</th></tr></thead>
            <tbody>
              {periodData.map(b => {
                const rev = Number(b.revenue);
                const avg = b.orders > 0 ? rev / b.orders : 0;
                return <tr key={b.period}>
                  <td style={td}>{fmtPeriodFull(b.period, groupBy)}</td>
                  <td style={tdR}>{b.orders}</td>
                  <td style={tdR}>{fmtRsFull(rev)}</td>
                  <td style={tdR}>{fmtRsFull(avg)}</td>
                  <td style={tdR}>{totalRev > 0 ? ((rev / totalRev) * 100).toFixed(1) : "0.0"}%</td>
                </tr>;
              })}
              <tr style={tot}><td style={{ ...td, ...tot }}>Total</td><td style={{ ...tdR, ...tot }}>{summary.totalOrders}</td><td style={{ ...tdR, ...tot }}>{fmtRsFull(totalRev)}</td><td style={{ ...tdR, ...tot }}>{fmtRsFull(Number(summary.avgOrderValue))}</td><td style={{ ...tdR, ...tot }}>100.0%</td></tr>
            </tbody>
          </table>
        </>
      )}

      {(section === "all" || section === "top-selling") && (
        <>
          <h2 style={{ fontSize: "12px", fontWeight: 700, margin: "16px 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Top Selling Items</h2>
          <table style={tbl}>
            <thead><tr><th style={{ ...th, width: "30px" }}>#</th><th style={th}>Item</th><th style={thR}>Qty</th><th style={thR}>Revenue</th><th style={thR}>% of Revenue</th></tr></thead>
            <tbody>
              {topItems.map((item, idx) => {
                const rev = Number(item.revenue);
                return <tr key={item.menuItemId}>
                  <td style={{ ...td, color: "#6b7280" }}>{idx + 1}</td>
                  <td style={td}>{item.name}</td>
                  <td style={tdR}>{item.quantitySold}</td>
                  <td style={tdR}>{fmtRsFull(rev)}</td>
                  <td style={tdR}>{((rev / topRevTotal) * 100).toFixed(1)}%</td>
                </tr>;
              })}
              <tr style={tot}><td style={{ ...td, ...tot }} colSpan={2}>Total</td><td style={{ ...tdR, ...tot }}>{topItems.reduce((s, i) => s + i.quantitySold, 0)}</td><td style={{ ...tdR, ...tot }}>{fmtRsFull(topRevTotal)}</td><td style={{ ...tdR, ...tot }}>100.0%</td></tr>
            </tbody>
          </table>
        </>
      )}

      {(section === "all" || section === "payments") && (
        <>
          <h2 style={{ fontSize: "12px", fontWeight: 700, margin: "16px 0 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Payment Methods</h2>
          <table style={tbl}>
            <thead><tr><th style={th}>Method</th><th style={thR}>Transactions</th><th style={thR}>Amount</th><th style={thR}>% of Total</th></tr></thead>
            <tbody>
              {paymentMethods.map(m => {
                const amt = Number(m.amount);
                return <tr key={m.method}>
                  <td style={td}>{METHOD_LABELS[m.method] ?? m.method}</td>
                  <td style={tdR}>{m.count}</td>
                  <td style={tdR}>{fmtRsFull(amt)}</td>
                  <td style={tdR}>{((amt / totalPay) * 100).toFixed(1)}%</td>
                </tr>;
              })}
              <tr style={tot}><td style={{ ...td, ...tot }}>Total</td><td style={{ ...tdR, ...tot }}>{paymentMethods.reduce((s, m) => s + m.count, 0)}</td><td style={{ ...tdR, ...tot }}>{fmtRsFull(totalPay)}</td><td style={{ ...tdR, ...tot }}>100.0%</td></tr>
            </tbody>
          </table>
        </>
      )}

      <p style={{ fontSize: "9px", color: "#bbb", borderTop: "1px solid #e5e7eb", paddingTop: "6px", marginTop: "6px" }}>Cafe POS · Confidential</p>
    </div>
  );
}

// ─── Skeleton helpers ─────────────────────────────────────────────────────────

function SkRow() {
  return (
    <tr className="border-b border-border-subtle">
      <td className="py-3 px-4"><div className="h-4 w-4 rounded bg-surface-sunken animate-pulse" /></td>
      <td className="py-3 px-4"><div className="h-4 w-32 rounded bg-surface-sunken animate-pulse" /></td>
      <td className="py-3 px-4"><div className="h-4 w-12 rounded bg-surface-sunken animate-pulse" /></td>
      <td className="py-3 px-4 text-right"><div className="h-4 w-20 rounded bg-surface-sunken animate-pulse ml-auto" /></td>
      <td className="py-3 px-4 text-right"><div className="h-4 w-10 rounded bg-surface-sunken animate-pulse ml-auto" /></td>
    </tr>
  );
}

// ─── Tab action bar ───────────────────────────────────────────────────────────

function TabActions({ title, subtitle, onExport, onPrint }: {
  title: string; subtitle: string; onExport: () => void; onPrint: () => void;
}) {
  return (
    <div className="flex items-center justify-between pb-2 border-b border-border-subtle mb-4">
      <div>
        <p className="body-sm font-semibold text-ink-primary">{title}</p>
        <p className="label-sm text-ink-faint">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onExport} className="label-sm">
          Export CSV
        </Button>
        <Button variant="secondary" onClick={onPrint} className="label-sm flex items-center gap-1.5">
          <IconPrinter className="h-3.5 w-3.5" /> Print
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [presetIdx, setPresetIdx]     = useState(2); // Last 7 days default
  const [groupBy, setGroupBy]         = useState<GroupBy>("day");
  const [customMode, setCustomMode]   = useState(false);
  const [customFrom, setCustomFrom]   = useState(daysAgo(6));
  const [customTo, setCustomTo]       = useState(today());
  const [activeTab, setActiveTab]     = useState<ReportTab>("sales");
  const [printSection, setPrintSection] = useState<PrintSection>("all");

  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState(false);
  const [summary, setSummary]         = useState<Summary | null>(null);
  const [periodData, setPeriodData]   = useState<PeriodBucket[]>([]);
  const [topItems, setTopItems]       = useState<TopItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);

  const fetchAll = useCallback(async (from: string, to: string, gb: GroupBy) => {
    setLoading(true); setLoadError(false);
    const q = `from=${from}&to=${to}&groupBy=${gb}`;
    try {
      const [s, p, ti, pm] = await Promise.all([
        apiFetchJson<Summary>(`/reports/summary?${q}`),
        apiFetchJson<PeriodBucket[]>(`/reports/revenue-by-period?${q}`),
        apiFetchJson<TopItem[]>(`/reports/top-items?${q}`),
        apiFetchJson<PaymentMethodRow[]>(`/reports/payment-methods?${q}`),
      ]);
      setSummary(s); setPeriodData(p); setTopItems(ti); setPaymentMethods(pm);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (customMode) return;
    const p = PRESETS[presetIdx];
    fetchAll(p.from(), p.to(), groupBy);
  }, [presetIdx, groupBy, customMode, fetchAll]);

  function applyPreset(idx: number) {
    setPresetIdx(idx);
    setGroupBy(PRESETS[idx].groupBy);
    setCustomMode(false);
  }

  function applyCustom() { fetchAll(customFrom, customTo, groupBy); }

  function printTab(section: PrintSection) {
    setPrintSection(section);
    setTimeout(() => window.print(), 50);
  }

  const hasData = !loading && summary && !loadError;
  const totalPayAmt = paymentMethods.reduce((s, m) => s + Number(m.amount), 0) || 1;
  const topRevTotal = topItems.reduce((s, i) => s + Number(i.revenue), 0) || 1;

  const TABS: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    { id: "sales",       label: "Sales",       icon: <IconBarChart className="h-4 w-4" /> },
    { id: "payments",    label: "Payments",    icon: <IconBanknote className="h-4 w-4" /> },
    { id: "top-selling", label: "Top Selling", icon: <IconReceipt className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* Printable (hidden on screen, section-aware) */}
      {hasData && (
        <PrintableReport summary={summary} periodData={periodData} topItems={topItems} paymentMethods={paymentMethods} groupBy={groupBy} section={printSection} />
      )}

      {/* ── Header ── */}
      <div data-screen-only>
        <PageHeader
          title="Reports"
          description="Sales analytics, top sellers, and payment breakdown."
          actions={
            hasData ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => exportAllCSV(summary, periodData, topItems, paymentMethods, groupBy)}>
                  Export All CSV
                </Button>
                <Button variant="secondary" onClick={() => printTab("all")} className="flex items-center gap-2">
                  <IconPrinter className="h-4 w-4" /> Print All
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      {/* ── Filters bar ── */}
      <div data-no-print className="rounded-xl border border-border-subtle bg-surface-raised p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-sm text-ink-faint w-14 shrink-0">Period</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p, i) => (
              <button key={p.label} type="button" onClick={() => applyPreset(i)}
                className={`rounded-full px-3 py-1 label-sm border transition-colors ${
                  presetIdx === i && !customMode
                    ? "bg-brand text-white border-brand"
                    : "border-border-subtle bg-surface text-ink-secondary hover:bg-surface-sunken"
                }`}>
                {p.label}
              </button>
            ))}
            <button type="button" onClick={() => { setCustomMode(true); setPresetIdx(-1); }}
              className={`rounded-full px-3 py-1 label-sm border transition-colors ${
                customMode ? "bg-brand text-white border-brand" : "border-border-subtle bg-surface text-ink-secondary hover:bg-surface-sunken"
              }`}>
              Custom range
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="label-sm text-ink-faint w-14 shrink-0">Group by</span>
          <div className="flex rounded-lg border border-border-strong overflow-hidden">
            {GROUP_OPTIONS.map(o => (
              <button key={o.value} type="button" onClick={() => { setGroupBy(o.value); if (!customMode) { const p = PRESETS[presetIdx]; if (p) fetchAll(p.from(), p.to(), o.value); } }}
                className={`px-4 py-1.5 label-sm border-r border-border-strong last:border-r-0 transition-colors ${
                  groupBy === o.value ? "bg-brand text-white" : "bg-surface text-ink-secondary hover:bg-surface-sunken"
                }`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {customMode && (
          <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-border-subtle">
            <div className="flex flex-col gap-1">
              <label className="label-sm text-ink-secondary">From</label>
              <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
                className="rounded-md border border-border-strong bg-surface px-3 py-2 body-md text-ink-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
            </div>
            <span className="pb-[11px] text-ink-faint">→</span>
            <div className="flex flex-col gap-1">
              <label className="label-sm text-ink-secondary">To</label>
              <input type="date" value={customTo} min={customFrom} max={today()} onChange={e => setCustomTo(e.target.value)}
                className="rounded-md border border-border-strong bg-surface px-3 py-2 body-md text-ink-primary outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
            </div>
            <Button variant="primary" onClick={applyCustom} className="mb-0.5">Apply</Button>
          </div>
        )}
      </div>

      {/* ── Error state ── */}
      {loadError && (
        <ErrorState
          title="Couldn't load reports"
          description="The report data didn't come through — check your connection and try again."
          onRetry={() => customMode ? applyCustom() : fetchAll(PRESETS[presetIdx]?.from(), PRESETS[presetIdx]?.to(), groupBy)}
        />
      )}

      {!loadError && (
        <>
          {/* ── KPI row ── */}
          <div className="grid gap-4 sm:grid-cols-3">
            {loading ? (
              <>
                {[0,1,2].map(i => (
                  <div key={i} className="rounded-xl border border-border-subtle bg-surface-raised p-5 shadow-sm">
                    <div className="h-3 w-24 rounded bg-surface-sunken animate-pulse mb-3" />
                    <div className="h-7 w-32 rounded bg-surface-sunken animate-pulse" />
                  </div>
                ))}
              </>
            ) : summary && (
              <>
                <div className="rounded-xl border border-border-subtle bg-surface-raised p-5 shadow-sm">
                  <p className="label-sm text-ink-faint mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-ink-primary">{fmtRsFull(summary.totalRevenue)}</p>
                  <p className="label-sm text-ink-faint mt-1">{summary.from.slice(0,10)} → {summary.to.slice(0,10)}</p>
                </div>
                <div className="rounded-xl border border-border-subtle bg-surface-raised p-5 shadow-sm">
                  <p className="label-sm text-ink-faint mb-1">Orders Paid</p>
                  <p className="text-2xl font-bold text-ink-primary">{summary.totalOrders.toLocaleString()}</p>
                  <p className="label-sm text-ink-faint mt-1">completed transactions</p>
                </div>
                <div className="rounded-xl border border-border-subtle bg-surface-raised p-5 shadow-sm">
                  <p className="label-sm text-ink-faint mb-1">Avg Order Value</p>
                  <p className="text-2xl font-bold text-ink-primary">{fmtRsFull(summary.avgOrderValue)}</p>
                  <p className="label-sm text-ink-faint mt-1">per transaction</p>
                </div>
              </>
            )}
          </div>

          {/* ── Tabs ── */}
          <div data-screen-only className="rounded-xl border border-border-subtle bg-surface-raised shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-border-subtle bg-surface-sunken">
              {TABS.map(tab => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3 label-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-brand text-brand bg-surface"
                      : "border-transparent text-ink-secondary hover:text-ink-primary hover:bg-surface"
                  }`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>

            {/* ── Sales tab ── */}
            {activeTab === "sales" && (
              <div className="p-6 space-y-6">
                {hasData && (
                  <TabActions
                    title="Sales"
                    subtitle={`Revenue and order breakdown · ${summary.from.slice(0,10)} → ${summary.to.slice(0,10)}`}
                    onExport={() => exportSalesCSV(summary, periodData, groupBy)}
                    onPrint={() => printTab("sales")}
                  />
                )}

                {/* Chart */}
                <div>
                  <p className="body-sm font-semibold text-ink-primary mb-1">Revenue over time</p>
                  <p className="label-sm text-ink-faint mb-4">
                    {GROUP_OPTIONS.find(o => o.value === groupBy)?.label} breakdown · {summary?.from.slice(0,10)} → {summary?.to.slice(0,10)}
                  </p>
                  {loading ? (
                    <div className="flex h-48 items-end gap-1">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full rounded-t animate-pulse bg-surface-sunken" style={{ height: `${30 + Math.random() * 100}px` }} />
                          <div className="h-2 w-8 rounded bg-surface-sunken animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : periodData.length === 0 ? (
                    <EmptyState icon={<IconBarChart />} title="No revenue data" description="No paid orders in this date range." />
                  ) : (
                    <RevenueChart data={periodData} groupBy={groupBy} />
                  )}
                </div>

                {/* Period table */}
                {(loading || periodData.length > 0) && (
                  <div>
                    <p className="body-sm font-semibold text-ink-primary mb-3">Breakdown by period</p>
                    <div className="overflow-x-auto rounded-lg border border-border-subtle">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-surface-sunken border-b border-border-subtle">
                            <th className="py-2.5 px-4 label-sm text-ink-secondary">Period</th>
                            <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Orders</th>
                            <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Revenue</th>
                            <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Avg / Order</th>
                            <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">% of Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? Array.from({ length: 5 }).map((_, i) => <SkRow key={i} />) :
                            periodData.map(b => {
                              const rev = Number(b.revenue);
                              const avg = b.orders > 0 ? rev / b.orders : 0;
                              const pct = Number(summary?.totalRevenue) > 0 ? ((rev / Number(summary?.totalRevenue)) * 100).toFixed(1) : "0.0";
                              return (
                                <tr key={b.period} className="border-b border-border-subtle last:border-0 hover:bg-surface-sunken transition-colors">
                                  <td className="py-3 px-4 body-md font-medium text-ink-primary">{fmtPeriodFull(b.period, groupBy)}</td>
                                  <td className="py-3 px-4 body-md text-ink-secondary text-right">{b.orders}</td>
                                  <td className="py-3 px-4 body-md text-ink-primary text-right font-medium">{fmtRsFull(rev)}</td>
                                  <td className="py-3 px-4 body-md text-ink-secondary text-right">{fmtRsFull(avg)}</td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="w-16 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="label-sm text-ink-faint w-10 text-right">{pct}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                        {!loading && summary && periodData.length > 0 && (
                          <tfoot>
                            <tr className="bg-surface-sunken border-t-2 border-border-strong">
                              <td className="py-3 px-4 label-sm font-bold text-ink-primary">Total</td>
                              <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">{summary.totalOrders}</td>
                              <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">{fmtRsFull(summary.totalRevenue)}</td>
                              <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">{fmtRsFull(summary.avgOrderValue)}</td>
                              <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">100.0%</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Payments tab ── */}
            {activeTab === "payments" && (
              <div className="p-6 space-y-6">
                {hasData && (
                  <TabActions
                    title="Payments"
                    subtitle={`How customers paid · ${summary.from.slice(0,10)} → ${summary.to.slice(0,10)}`}
                    onExport={() => exportPaymentsCSV(summary, paymentMethods)}
                    onPrint={() => printTab("payments")}
                  />
                )}

                {loading ? (
                  <div className="space-y-4">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="h-4 w-24 rounded bg-surface-sunken animate-pulse" />
                        <div className="flex-1 h-2 rounded-full bg-surface-sunken animate-pulse" />
                        <div className="h-4 w-20 rounded bg-surface-sunken animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <EmptyState icon={<IconBanknote />} title="No payment data" description="No paid orders in this date range." />
                ) : (
                  <>
                    <div className="space-y-3">
                      {paymentMethods.map(m => {
                        const amt = Number(m.amount);
                        const pct = (amt / totalPayAmt) * 100;
                        return (
                          <div key={m.method}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="body-md font-medium text-ink-primary flex items-center gap-1.5">
                                <IconQrCode className="h-3.5 w-3.5 text-ink-faint" />
                                {METHOD_LABELS[m.method] ?? m.method}
                              </span>
                              <span className="label-sm text-ink-secondary">{fmtRsFull(amt)} · {m.count} txn · {pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-surface-sunken overflow-hidden">
                              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-border-subtle">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-surface-sunken border-b border-border-subtle">
                            <th className="py-2.5 px-4 label-sm text-ink-secondary">Method</th>
                            <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Transactions</th>
                            <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Amount</th>
                            <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">% of Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentMethods.map(m => {
                            const amt = Number(m.amount);
                            const pct = ((amt / totalPayAmt) * 100).toFixed(1);
                            return (
                              <tr key={m.method} className="border-b border-border-subtle last:border-0 hover:bg-surface-sunken transition-colors">
                                <td className="py-3 px-4 body-md font-medium text-ink-primary">
                                  <span className="flex items-center gap-1.5">
                                    <IconQrCode className="h-3.5 w-3.5 text-ink-faint" />
                                    {METHOD_LABELS[m.method] ?? m.method}
                                  </span>
                                </td>
                                <td className="py-3 px-4 body-md text-ink-secondary text-right">{m.count}</td>
                                <td className="py-3 px-4 body-md font-medium text-ink-primary text-right">{fmtRsFull(amt)}</td>
                                <td className="py-3 px-4 label-sm text-ink-faint text-right">{pct}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-surface-sunken border-t-2 border-border-strong">
                            <td className="py-3 px-4 label-sm font-bold text-ink-primary">Total</td>
                            <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">{paymentMethods.reduce((s, m) => s + m.count, 0)}</td>
                            <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">{fmtRsFull(totalPayAmt)}</td>
                            <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">100.0%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Top Selling tab ── */}
            {activeTab === "top-selling" && (
              <div className="p-6 space-y-4">
                {hasData && (
                  <TabActions
                    title="Top Selling"
                    subtitle={`Best-performing items by quantity sold · ${summary.from.slice(0,10)} → ${summary.to.slice(0,10)}`}
                    onExport={() => exportTopSellingCSV(summary, topItems)}
                    onPrint={() => printTab("top-selling")}
                  />
                )}

                {loading ? (
                  <div className="overflow-x-auto rounded-lg border border-border-subtle">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-surface-sunken border-b border-border-subtle">
                          <th className="py-2.5 px-4 label-sm text-ink-secondary">#</th>
                          <th className="py-2.5 px-4 label-sm text-ink-secondary">Item</th>
                          <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Qty Sold</th>
                          <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Revenue</th>
                          <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">% of Revenue</th>
                        </tr>
                      </thead>
                      <tbody>{Array.from({ length: 6 }).map((_, i) => <SkRow key={i} />)}</tbody>
                    </table>
                  </div>
                ) : topItems.length === 0 ? (
                  <EmptyState icon={<IconReceipt />} title="No sales data" description="No paid orders in this date range." />
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border-subtle">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-surface-sunken border-b border-border-subtle">
                          <th className="py-2.5 px-4 label-sm text-ink-secondary w-10">#</th>
                          <th className="py-2.5 px-4 label-sm text-ink-secondary">Item</th>
                          <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Qty Sold</th>
                          <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">Revenue</th>
                          <th className="py-2.5 px-4 label-sm text-ink-secondary text-right">% of Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topItems.map((item, idx) => {
                          const rev = Number(item.revenue);
                          const pct = ((rev / topRevTotal) * 100).toFixed(1);
                          return (
                            <tr key={item.menuItemId} className="border-b border-border-subtle last:border-0 hover:bg-surface-sunken transition-colors">
                              <td className="py-3 px-4">
                                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full label-sm font-bold ${
                                  idx === 0 ? "bg-yellow-100 text-yellow-700" :
                                  idx === 1 ? "bg-gray-100 text-gray-600" :
                                  idx === 2 ? "bg-orange-100 text-orange-600" :
                                  "bg-surface-sunken text-ink-faint"
                                }`}>{idx + 1}</span>
                              </td>
                              <td className="py-3 px-4 body-md font-medium text-ink-primary">{item.name}</td>
                              <td className="py-3 px-4 body-md text-ink-secondary text-right">{item.quantitySold}</td>
                              <td className="py-3 px-4 body-md font-medium text-ink-primary text-right">{fmtRsFull(rev)}</td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="label-sm text-ink-faint w-10 text-right">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-sunken border-t-2 border-border-strong">
                          <td className="py-3 px-4" colSpan={2}>
                            <span className="label-sm font-bold text-ink-primary">Total</span>
                          </td>
                          <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">
                            {topItems.reduce((s, i) => s + i.quantitySold, 0)}
                          </td>
                          <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">
                            {fmtRsFull(topRevTotal)}
                          </td>
                          <td className="py-3 px-4 label-sm font-bold text-ink-primary text-right">100.0%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
