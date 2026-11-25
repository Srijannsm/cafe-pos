"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorState } from "../../../components/ui/ErrorState";
import {
  IconBanknote,
  IconUsers,
  IconClipboardList,
  IconTable,
  IconBarChart,
  IconAlert,
  IconReceipt,
  IconSearch,
  IconX,
} from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";

type PlanInfo = {
  plan: "starter" | "standard" | "premium" | "trial";
  subscriptionStatus: "trial" | "active" | "overdue" | "cancelled";
  nextBillingAt: string | null;
  isOverdue: boolean;
  features: {
    qrOrdering: boolean;
    reports: boolean;
    maxStaff: number | null;
    maxMenuItems: number | null;
    maxTables: number | null;
  };
  usage?: {
    staffCount: number;
    menuItemCount: number;
    tableCount: number;
  };
};

type OrderItem = {
  id: number;
  quantity: number;
  price: string;
  menuItem: { name: string };
  orderItemModifiers: { modifier: { name: string; priceAdjustment: string } }[];
};

type Payment = {
  id: number;
  amount: string;
  method: string;
  paidAt: string;
};

type BillOrder = {
  id: number;
  status: string;
  orderType: string;
  createdAt: string;
  billedAt: string | null;
  notes: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  totalAmount: string | null;
  table: { tableNumber: string } | null;
  waiter: { name: string } | null;
  orderItems: OrderItem[];
  payments: Payment[];
  cafe: { name: string; vatEnabled: boolean; vatRate: string; panNumber: string | null };
};

const PLAN_DISPLAY: Record<string, { label: string; price: string; colorClass: string }> = {
  starter:  { label: "Starter",  price: "Rs. 999/mo",   colorClass: "text-ink-secondary" },
  standard: { label: "Standard", price: "Rs. 1,999/mo", colorClass: "text-blue-600" },
  premium:  { label: "Premium",  price: "Rs. 3,499/mo", colorClass: "text-amber-600" },
  trial:    { label: "Trial",    price: "Free",         colorClass: "text-brand" },
};

const STATUS_STYLES: Record<string, string> = {
  trial:     "bg-blue-50 text-blue-700",
  active:    "bg-status-success-tint text-status-success-ink",
  overdue:   "bg-yellow-50 text-yellow-700",
  cancelled: "bg-surface-sunken text-ink-faint",
};

const ORDER_STATUS_STYLES: Record<string, string> = {
  pending:   "bg-yellow-50 text-yellow-700",
  preparing: "bg-blue-50 text-blue-700",
  served:    "bg-purple-50 text-purple-700",
  billed:    "bg-orange-50 text-orange-700",
  paid:      "bg-green-50 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  esewa_qr: "eSewa QR",
  khalti_qr: "Khalti QR",
  fonepay_qr: "FonePay QR",
};

/** Safely parse a price string/number to a float, defaulting to 0 */
function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmtRs(n: string | number | null | undefined) {
  const val = toNum(n);
  return `Rs ${val.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NP", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NP", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Compute line total for one item including modifiers */
function itemLineTotal(item: OrderItem): number {
  const base = toNum(item.price) * item.quantity;
  const modAdj = item.orderItemModifiers.reduce(
    (s, m) => s + toNum(m.modifier.priceAdjustment) * item.quantity, 0
  );
  return base + modAdj;
}

// ─── Bill Modal ───────────────────────────────────────────────────────────────

function BillModal({ order, onClose }: { order: BillOrder; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  // Compute subtotal from items if the API field is null/zero
  const computedSubtotal = order.orderItems.reduce((s, i) => s + itemLineTotal(i), 0);
  const subtotal = toNum(order.subtotal) > 0 ? toNum(order.subtotal) : computedSubtotal;
  const vatRate = toNum(order.cafe.vatRate);
  const vatAmount = toNum(order.vatAmount) > 0
    ? toNum(order.vatAmount)
    : (order.cafe.vatEnabled ? subtotal * vatRate / 100 : 0);
  const total = toNum(order.totalAmount) > 0
    ? toNum(order.totalAmount)
    : subtotal + vatAmount;

  function handlePrint() {
    const printContent = printRef.current;
    if (!printContent) return;
    const win = window.open("", "_blank", "width=400,height=700");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill #${order.id}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Courier New', monospace; font-size: 12px; color: #111; padding: 16px; width: 300px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .lg { font-size: 15px; }
          .sm { font-size: 10px; color: #555; }
          .divider { border-top: 1px dashed #aaa; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
          .row-left { flex: 1; }
          .row-right { white-space: nowrap; }
          .total-row { font-weight: bold; font-size: 13px; border-top: 1px solid #111; padding-top: 6px; margin-top: 4px; }
          .item-mod { color: #555; font-size: 10px; padding-left: 8px; }
          .status { display: inline-block; padding: 1px 6px; border: 1px solid #111; border-radius: 3px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin: 8px 0 4px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold lg">${order.cafe.name}</div>
          ${order.cafe.panNumber ? `<div class="sm">PAN: ${order.cafe.panNumber}</div>` : ""}
          <div class="sm" style="margin-top:2px">Bill #${order.id} &nbsp;·&nbsp; <span class="status">${order.status.toUpperCase()}</span></div>
        </div>
        <div class="divider"></div>
        <div class="row sm">
          <span>Table: ${order.table?.tableNumber ?? "—"}</span>
          <span>Waiter: ${order.waiter?.name ?? "—"}</span>
        </div>
        <div class="row sm">
          <span>${order.orderType.replace("_", " ").toUpperCase()}</span>
          <span>${formatDateTime(order.createdAt)}</span>
        </div>
        ${order.billedAt ? `<div class="row sm"><span>Billed</span><span>${formatDateTime(order.billedAt)}</span></div>` : ""}
        ${order.notes ? `<div class="sm" style="margin-top:4px">Note: ${order.notes}</div>` : ""}
        <div class="divider"></div>
        <div class="section-title">Items</div>
        ${order.orderItems.map(item => `
          <div class="row">
            <span class="row-left">${item.quantity}× ${item.menuItem.name}</span>
            <span class="row-right">${fmtRs(itemLineTotal(item))}</span>
          </div>
          ${item.orderItemModifiers.map(m => `<div class="item-mod">+ ${m.modifier.name}${toNum(m.modifier.priceAdjustment) !== 0 ? ` (${fmtRs(toNum(m.modifier.priceAdjustment) * item.quantity)})` : ""}</div>`).join("")}
        `).join("")}
        <div class="divider"></div>
        <div class="row"><span>Subtotal</span><span>${fmtRs(subtotal)}</span></div>
        ${order.cafe.vatEnabled ? `<div class="row"><span>VAT (${vatRate}%)</span><span>${fmtRs(vatAmount)}</span></div>` : ""}
        <div class="row total-row"><span>TOTAL</span><span>${fmtRs(total)}</span></div>
        ${order.payments.length > 0 ? `
          <div class="divider"></div>
          <div class="section-title">Payments</div>
          ${order.payments.map(p => `
            <div class="row">
              <span class="row-left">${METHOD_LABELS[p.method] ?? p.method}</span>
              <span class="row-right">${fmtRs(p.amount)}</span>
            </div>
            <div class="sm" style="padding-left:8px;margin-bottom:2px">${formatDateTime(p.paidAt)}</div>
          `).join("")}
        ` : ""}
        <div class="divider"></div>
        <div class="center sm" style="margin-top:4px">Thank you for your visit!</div>
        <div class="center sm">Printed ${new Date().toLocaleString("en-NP")}</div>
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={printRef}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink-primary">Bill #{order.id}</h2>
            <p className="text-xs text-ink-faint mt-0.5">{order.cafe.name}{order.cafe.panNumber ? ` · PAN: ${order.cafe.panNumber}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs rounded-full px-2.5 py-0.5 font-semibold capitalize ${ORDER_STATUS_STYLES[order.status] ?? "bg-gray-100 text-gray-500"}`}>
              {order.status}
            </span>
            {/* Print button */}
            <button
              onClick={handlePrint}
              title="Print bill"
              className="rounded-lg p-1.5 text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-sunken hover:text-ink-primary transition"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-6">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border-subtle bg-surface-sunken p-4 text-sm">
            <div>
              <p className="text-xs text-ink-faint mb-0.5">Table</p>
              <p className="font-semibold text-ink-primary">{order.table?.tableNumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint mb-0.5">Waiter</p>
              <p className="font-semibold text-ink-primary">{order.waiter?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint mb-0.5">Order type</p>
              <p className="font-semibold text-ink-primary capitalize">{order.orderType.replace("_", " ")}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint mb-0.5">Created</p>
              <p className="font-semibold text-ink-primary">{formatDateTime(order.createdAt)}</p>
            </div>
            {order.billedAt && (
              <div className="col-span-2">
                <p className="text-xs text-ink-faint mb-0.5">Billed at</p>
                <p className="font-semibold text-ink-primary">{formatDateTime(order.billedAt)}</p>
              </div>
            )}
            {order.notes && (
              <div className="col-span-2">
                <p className="text-xs text-ink-faint mb-0.5">Notes</p>
                <p className="font-semibold text-ink-primary">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-2">Items</p>
            <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle overflow-hidden">
              {order.orderItems.length === 0 && (
                <p className="px-4 py-3 text-sm text-ink-faint">No items</p>
              )}
              {order.orderItems.map((item) => {
                const lineTotal = itemLineTotal(item);
                return (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-ink-primary">
                          {item.quantity}× {item.menuItem.name}
                        </p>
                        <p className="text-xs text-ink-faint mt-0.5">
                          {fmtRs(toNum(item.price))} each
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-ink-primary shrink-0">{fmtRs(lineTotal)}</p>
                    </div>
                    {item.orderItemModifiers.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {item.orderItemModifiers.map((m, idx) => (
                          <p key={idx} className="text-xs text-ink-faint pl-3 before:content-['+_'] before:text-ink-faint">
                            {m.modifier.name}
                            {toNum(m.modifier.priceAdjustment) !== 0 && (
                              <span className="ml-1 text-ink-secondary">(+{fmtRs(toNum(m.modifier.priceAdjustment))} × {item.quantity})</span>
                            )}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-border-subtle bg-surface-sunken p-4 space-y-2 text-sm">
            <div className="flex justify-between text-ink-secondary">
              <span>Subtotal</span>
              <span className="font-medium text-ink-primary">{fmtRs(subtotal)}</span>
            </div>
            {order.cafe.vatEnabled && (
              <div className="flex justify-between text-ink-secondary">
                <span>VAT ({vatRate}%)</span>
                <span className="font-medium text-ink-primary">{fmtRs(vatAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border-subtle pt-2.5 mt-1">
              <span className="font-bold text-ink-primary text-base">Total</span>
              <span className="font-bold text-ink-primary text-base">{fmtRs(total)}</span>
            </div>
          </div>

          {/* Payments */}
          {order.payments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-2">Payments received</p>
              <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle overflow-hidden">
                {order.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-primary">{METHOD_LABELS[p.method] ?? p.method}</p>
                      <p className="text-xs text-ink-faint mt-0.5">{formatDateTime(p.paidAt)}</p>
                    </div>
                    <p className="text-sm font-bold text-ink-primary">{fmtRs(p.amount)}</p>
                  </div>
                ))}
              </div>
              {/* Change due */}
              {(() => {
                const totalPaid = order.payments.reduce((s, p) => s + toNum(p.amount), 0);
                const change = totalPaid - total;
                if (change > 0.005) {
                  return (
                    <div className="mt-2 flex justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm">
                      <span className="text-green-700 font-medium">Change due</span>
                      <span className="text-green-800 font-bold">{fmtRs(change)}</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bill Lookup Section ──────────────────────────────────────────────────────

function BillLookup() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<BillOrder | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [modalOrder, setModalOrder] = useState<BillOrder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const billNo = parseInt(query.trim(), 10);
    if (isNaN(billNo) || billNo <= 0) return;

    setSearching(true);
    setResult(null);
    setNotFound(false);
    setError(false);

    try {
      const order = await apiFetchJson<BillOrder>(`/orders/${billNo}`);
      setResult(order);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 404) setNotFound(true);
      else setError(true);
    } finally {
      setSearching(false);
    }
  }

  function clear() {
    setQuery("");
    setResult(null);
    setNotFound(false);
    setError(false);
    inputRef.current?.focus();
  }

  // Compute total for result card
  const resultTotal = result
    ? (() => {
        const computed = result.orderItems.reduce((s, i) => s + itemLineTotal(i), 0);
        const sub = toNum(result.subtotal) > 0 ? toNum(result.subtotal) : computed;
        const vat = toNum(result.vatAmount) > 0 ? toNum(result.vatAmount) : (result.cafe.vatEnabled ? sub * toNum(result.cafe.vatRate) / 100 : 0);
        return toNum(result.totalAmount) > 0 ? toNum(result.totalAmount) : sub + vat;
      })()
    : 0;

  return (
    <>
      <SectionCard
        icon={<IconSearch />}
        title="Bill lookup"
        description="Enter a bill number to review its details, items, and payment."
      >
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="number"
              min={1}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter bill number…"
              className="w-full rounded-lg border border-border-strong bg-surface-base px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            {query && (
              <button
                type="button"
                onClick={clear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-primary transition"
              >
                <IconX className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!query.trim() || searching}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <IconSearch className="h-4 w-4" />
            )}
            Search
          </button>
        </form>

        {/* Result preview card */}
        {result && (
          <button
            onClick={() => setModalOrder(result)}
            className="mt-4 w-full rounded-xl border border-border-subtle bg-surface-sunken px-5 py-4 text-left transition hover:border-brand hover:bg-surface-base group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-ink-primary">Bill #{result.id}</p>
                <p className="text-xs text-ink-faint mt-0.5 truncate">
                  {result.table?.tableNumber ?? "No table"} · {result.waiter?.name ?? "Unknown"} · {formatDateTime(result.createdAt)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-ink-primary">{fmtRs(resultTotal)}</p>
                <span className={`text-xs rounded-full px-2 py-0.5 font-semibold capitalize ${ORDER_STATUS_STYLES[result.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {result.status}
                </span>
              </div>
            </div>
            <p className="text-xs mt-2 text-brand font-medium group-hover:underline">View full details →</p>
          </button>
        )}

        {notFound && (
          <div className="mt-4 rounded-xl border border-border-subtle bg-surface-sunken px-5 py-4 text-center">
            <p className="text-sm font-semibold text-ink-primary">Bill not found</p>
            <p className="text-xs mt-1 text-ink-faint">No bill with number #{query} exists in your cafe.</p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-red-700">Something went wrong</p>
            <p className="text-xs mt-1 text-red-500">Couldn&apos;t fetch the bill. Please try again.</p>
          </div>
        )}
      </SectionCard>

      {modalOrder && <BillModal order={modalOrder} onClose={() => setModalOrder(null)} />}
    </>
  );
}

// ─── Usage Meter ──────────────────────────────────────────────────────────────

function UsageMeter({
  label,
  icon: Icon,
  used,
  max,
}: {
  label: string;
  icon: React.FC<{ className?: string }>;
  used: number;
  max: number | null;
}) {
  const isUnlimited = max === null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / max!) * 100));
  const isFull = !isUnlimited && pct >= 100;
  const isHigh = !isUnlimited && pct >= 80 && !isFull;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-ink-faint" />
          <span className="text-sm text-ink-secondary">{label}</span>
        </div>
        <span className={`text-xs font-semibold ${isFull ? "text-red-600" : isHigh ? "text-yellow-600" : "text-ink-primary"}`}>
          {isUnlimited ? `${used} / ∞` : `${used} / ${max}`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        {isUnlimited ? (
          <div className="h-full w-full rounded-full bg-brand/20" />
        ) : (
          <div
            className={`h-full rounded-full transition-all ${isFull ? "bg-red-500" : isHigh ? "bg-yellow-400" : "bg-brand"}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function FeaturePill({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span className={`text-xs inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${enabled ? "bg-green-50 text-green-700" : "bg-surface-sunken text-ink-faint"}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${enabled ? "bg-green-600" : "bg-ink-faint"}`} />
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PlanRow = {
  key: string; name: string; description: string | null; monthlyPrice: number; yearlyMonths: number;
  maxStaff: number | null; maxMenuItems: number | null; maxTables: number | null;
  qrOrdering: boolean; reports: boolean; inventory: boolean; tableGame: boolean;
};
type MyPlan = {
  plan: string; planName: string; billingCycle: string; price: number; subscriptionStatus: "trial" | "active" | "overdue" | "cancelled";
  nextBillingAt: string | null; trialEndsAt: string; isOverdue: boolean;
  features: { qrOrdering: boolean; reports: boolean; inventory: boolean; tableGame: boolean; maxStaff: number | null; maxMenuItems: number | null; maxTables: number | null };
  usage: { staffCount: number; menuItemCount: number; tableCount: number };
  plans: PlanRow[];
};

const FEATURE_ROWS: { key: "qrOrdering" | "reports" | "inventory" | "tableGame"; label: string }[] = [
  { key: "qrOrdering", label: "QR self-ordering" },
  { key: "reports", label: "Reports & analytics" },
  { key: "inventory", label: "Inventory & recipes" },
  { key: "tableGame", label: "Customer table game" },
];

// Prices, limits and features come from the platform's editable plans
// (/platform/plans) via GET /cafes/my-plan -- nothing here is hardcoded.
export default function BillingPage() {
  const [info, setInfo] = useState<MyPlan | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetchJson<MyPlan>("/cafes/my-plan").then(setInfo).catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div>
        <PageHeader title="Plan" description="Your subscription, usage and what's included." />
        <ErrorState title="Couldn't load your plan" description="Please refresh the page or contact your platform administrator." />
      </div>
    );
  }
  if (!info) {
    return (
      <div className="space-y-4">
        <PageHeader title="Plan" description="Your subscription, usage and what's included." />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const trial = info.subscriptionStatus === "trial";
  const trialLeft = Math.ceil((new Date(info.trialEndsAt).getTime() - Date.now()) / 86400000);
  const limit = (n: number | null) => (n == null ? "Unlimited" : n.toLocaleString("en-IN"));

  return (
    <div className="space-y-6">
      <PageHeader title="Plan" description="Your subscription, usage and what's included." />

      {info.isOverdue && (
        <div className="flex items-start gap-3 rounded-2xl border border-status-warning/40 bg-status-warning-tint px-5 py-4 text-status-warning-ink">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Your subscription payment is overdue</p>
            <p className="mt-0.5 text-sm">The app is read-only for new orders until payment is received. Contact your platform administrator.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border-subtle bg-surface-raised p-6 lg:col-span-2">
          <p className="text-sm text-ink-secondary">Current plan</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-2xl font-semibold">{trial ? "Free trial" : info.planName}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[info.subscriptionStatus]}`}>{info.subscriptionStatus}</span>
          </div>
          <p className="mt-1 text-sm text-ink-secondary">
            {trial
              ? `Everything unlocked · ${trialLeft > 0 ? `${trialLeft} day${trialLeft === 1 ? "" : "s"} left` : "trial ended"} · then ${info.planName} at Rs ${info.price.toLocaleString("en-IN")}/${info.billingCycle === "yearly" ? "year" : "month"}`
              : `Rs ${info.price.toLocaleString("en-IN")} / ${info.billingCycle === "yearly" ? "year" : "month"}`}
            {info.nextBillingAt && !trial ? ` · next bill ${formatDate(info.nextBillingAt)}` : ""}
          </p>
          <div className="mt-6 space-y-5">
            <UsageMeter label="Staff accounts" icon={IconUsers} used={info.usage.staffCount} max={info.features.maxStaff} />
            <UsageMeter label="Menu items" icon={IconClipboardList} used={info.usage.menuItemCount} max={info.features.maxMenuItems} />
            <UsageMeter label="Tables" icon={IconTable} used={info.usage.tableCount} max={info.features.maxTables} />
          </div>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-surface-raised p-6">
          <p className="mb-4 text-sm font-semibold">Included{trial ? " during your trial" : ""}</p>
          <ul className="space-y-3 text-sm">
            {["Waiter app & kitchen display", "Billing, receipts & cash drawer", "Menu, tables & QR codes"].map((l) => (
              <li key={l} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-status-success" />{l}</li>
            ))}
            {FEATURE_ROWS.map((f) => (
              <li key={f.key} className={`flex items-center gap-2 ${info.features[f.key] ? "" : "text-ink-faint line-through"}`}>
                <span className={`h-2 w-2 rounded-full ${info.features[f.key] ? "bg-status-success" : "bg-border-strong"}`} />{f.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Compare plans */}
      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface-raised">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-5 py-4 text-left font-medium text-ink-faint">Compare plans</th>
              {info.plans.map((p) => (
                <th key={p.key} className={`px-5 py-4 text-left ${p.key === info.plan ? "bg-brand-tint" : ""}`}>
                  <p className="font-semibold">{p.name}{p.key === info.plan && <span className="ml-2 text-xs font-medium text-brand-strong">{trial ? "after trial" : "current"}</span>}</p>
                  <p className="tabular font-normal text-ink-secondary">Rs {p.monthlyPrice.toLocaleString("en-IN")}/mo</p>
                  {p.description && <p className="mt-1 text-xs font-normal text-ink-faint">{p.description}</p>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([["maxStaff", "Staff accounts"], ["maxMenuItems", "Menu items"], ["maxTables", "Tables"]] as const).map(([k, l]) => (
              <tr key={k} className="border-b border-border-subtle">
                <td className="px-5 py-3 text-ink-secondary">{l}</td>
                {info.plans.map((p) => <td key={p.key} className={`tabular px-5 py-3 ${p.key === info.plan ? "bg-brand-tint/50" : ""}`}>{limit(p[k])}</td>)}
              </tr>
            ))}
            {FEATURE_ROWS.map((f) => (
              <tr key={f.key} className="border-b border-border-subtle last:border-0">
                <td className="px-5 py-3 text-ink-secondary">{f.label}</td>
                {info.plans.map((p) => <td key={p.key} className={`px-5 py-3 ${p.key === info.plan ? "bg-brand-tint/50" : ""}`}>{p[f.key] ? "✓" : <span className="text-ink-faint">—</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-border-subtle px-5 py-3 text-xs text-ink-faint">To change plan, contact your platform administrator.</p>
      </div>

      <BillLookup />
    </div>
  );
}
