"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetchJson } from "../../../lib/api";
import { useRequireAuth, useCurrentUser } from "../../../lib/useRequireAuth";
import { useToast } from "../../../components/Toast";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorState } from "../../../components/ui/ErrorState";
import { IconChevronLeft, IconPercent, IconPrinter, IconUndo, IconCheck, IconSplit } from "../../../components/icons";
import { METHOD_LABEL, rs } from "../../../lib/format";

type Line = {
  id: number; quantity: number; price: string; voidedAt: string | null; note: string | null;
  menuItem: { name: string }; orderItemModifiers: { modifier: { name: string; priceDelta: string } }[];
};
type Order = {
  id: number; status: string; billNumber: number | null; total: string | null; subtotal: string | null; vatAmount: string | null;
  discountType: "percent" | "flat" | null; discountValue: string | null; discountAmount: string | null; discountReason: string | null;
  serviceCharge: string | null; printCount: number;
  table: { tableNumber: string }; waiter: { name: string } | null; orderItems: Line[];
  payments: { id: number; amount: string; method: string; reference: string | null; paidAt: string }[];
  cafe: { vatEnabled: boolean; vatRate: string; pricesIncludeVat: boolean; serviceChargeRate: string };
};
type Estimate = { subtotal: string; discountAmount: string; serviceCharge: string; vatAmount: string; total: string; paid: string; remaining: string };
type Method = "cash" | "esewa_qr" | "khalti_qr" | "fonepay_qr";

const METHODS: Method[] = ["cash", "fonepay_qr", "esewa_qr", "khalti_qr"];
const DISCOUNT_REASONS = ["Regular customer", "Staff meal", "Complaint / delay", "Happy hour", "Owner's guest", "Promotion"];
const lineTotal = (l: Line) => (Number(l.price) + l.orderItemModifiers.reduce((s, m) => s + Number(m.modifier.priceDelta), 0)) * l.quantity;

export default function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const ready = useRequireAuth();
  const { showToast, toastHost } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<Method>("cash");
  const [amount, setAmount] = useState("");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [splitN, setSplitN] = useState(1);
  const role = useCurrentUser()?.role;
  const canPay = role === "admin" || role === "cashier";

  const load = useCallback(async () => {
    try {
      const [o, e] = await Promise.all([apiFetchJson<Order>(`/orders/${orderId}`), apiFetchJson<Estimate>(`/orders/${orderId}/estimate`)]);
      if (o.status === "paid") return router.replace(`/billing/${orderId}/receipt`);
      setOrder(o);
      setEst(e);
      setAmount(e.remaining);
      setTendered("");
    } catch {
      setErr(true);
    }
  }, [orderId, router]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const remaining = Number(est?.remaining ?? 0);
  const perPerson = splitN > 1 ? Math.ceil((remaining / splitN) * 100) / 100 : null;
  const amt = Math.min(Number(amount || 0), remaining);
  const change = method === "cash" && Number(tendered) > amt ? Number(tendered) - amt : 0;
  const quickCash = useMemo(() => {
    const a = amt || remaining;
    const set = new Set([a, Math.ceil(a / 100) * 100, Math.ceil(a / 500) * 500, Math.ceil(a / 1000) * 1000]);
    return [...set].filter((v) => v >= a).slice(0, 4);
  }, [amt, remaining]);

  async function call(path: string, init?: RequestInit) {
    setBusy(true);
    try {
      return await apiFetchJson(`/orders/${orderId}/${path}`, init);
    } catch (e) {
      showToast((e as Error).message, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (await call("bill", { method: "PATCH" })) {
      showToast("Bill generated");
      load();
    }
  }

  async function reopen() {
    if (await call("reopen", { method: "PATCH" })) {
      showToast("Bill reopened — items can be added again");
      router.push(`/order/${orderId}`);
    }
  }

  async function pay() {
    if (!amt) return;
    const res = (await call("payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, amount: Math.round(amt * 100) / 100, reference: reference || undefined }),
    })) as { fullyPaid: boolean; remaining: string } | null;
    if (!res) return;
    navigator.vibrate?.([20, 40, 20]);
    if (res.fullyPaid) {
      router.push(`/billing/${orderId}/receipt?print=1${change ? `&change=${change}` : ""}`);
    } else {
      showToast(`${rs(amt)} received · ${rs(res.remaining)} left`);
      setReference("");
      if (splitN > 1) setSplitN((n) => Math.max(1, n - 1));
      load();
    }
  }

  if (err) return <main className="p-6"><ErrorState title="Couldn't load this bill" onRetry={load} /></main>;
  if (!order || !est) return <main className="mx-auto max-w-5xl space-y-4 p-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 rounded-2xl" /></main>;

  const isBilled = order.status === "billed";
  const live = order.orderItems.filter((l) => !l.voidedAt);

  return (
    <main className="min-h-screen bg-surface-canvas">
      {toastHost}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border-subtle bg-surface-raised px-2 sm:px-4">
        <Link href="/billing" aria-label="Back" className="rounded-full p-2.5 text-ink-secondary hover:bg-surface-sunken"><IconChevronLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <p className="font-semibold leading-tight">Table {order.table.tableNumber}</p>
          <p className="text-xs text-ink-faint">{order.billNumber ? `Bill #${order.billNumber}` : "Estimate"} · {order.waiter?.name ?? "QR order"}</p>
        </div>
        {isBilled && <Link href={`/billing/${orderId}/receipt`}><Button size="small" variant="secondary" icon={<IconPrinter />}>{order.printCount ? "Reprint" : "Print bill"}</Button></Link>}
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_400px]">
        {/* Bill */}
        <section className="rounded-2xl border border-border-subtle bg-surface-raised">
          <ul className="divide-y divide-border-subtle">
            {live.map((l) => (
              <li key={l.id} className="flex gap-3 px-5 py-3">
                <span className="tabular w-7 text-sm font-semibold">{l.quantity}×</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{l.menuItem.name}</p>
                  {l.orderItemModifiers.length > 0 && <p className="text-xs text-ink-faint">{l.orderItemModifiers.map((m) => m.modifier.name).join(", ")}</p>}
                </div>
                <span className="tabular text-sm">{rs(lineTotal(l))}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t border-border-subtle px-5 py-4 text-sm">
            <Row l="Subtotal" v={est.subtotal} />
            {Number(est.discountAmount) > 0 && <Row l={`Discount${order.discountType === "percent" ? ` ${Number(order.discountValue)}%` : ""} · ${order.discountReason ?? ""}`} v={`-${est.discountAmount}`} tone="success" />}
            {Number(est.serviceCharge) > 0 && <Row l={`Service charge ${Number(order.cafe.serviceChargeRate)}%`} v={est.serviceCharge} />}
            {order.cafe.vatEnabled && <Row l={`VAT ${Number(order.cafe.vatRate)}%${order.cafe.pricesIncludeVat ? " (included)" : ""}`} v={est.vatAmount} />}
            <div className="flex items-baseline justify-between border-t border-border-subtle pt-3">
              <dt className="text-base font-semibold">Total</dt>
              <dd className="tabular text-2xl font-semibold">{rs(est.total)}</dd>
            </div>
            {order.payments.map((p) => (
              <Row key={p.id} l={`Paid · ${METHOD_LABEL[p.method] ?? p.method}${p.reference ? ` (${p.reference})` : ""}`} v={`-${p.amount}`} tone="muted" />
            ))}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-border-subtle px-5 py-4">
            {canPay && order.payments.length === 0 && (
              <Button size="small" variant="secondary" icon={<IconPercent />} onClick={() => setDiscountOpen(true)}>{Number(est.discountAmount) > 0 ? "Change discount" : "Discount"}</Button>
            )}
            {isBilled && order.payments.length === 0 && <Button size="small" variant="ghost" icon={<IconUndo />} loading={busy} onClick={reopen}>Reopen to add items</Button>}
          </div>
        </section>

        {/* Payment */}
        <section className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {!isBilled ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5">
              <p className="mb-1 text-sm text-ink-secondary">Customer pays</p>
              <p className="tabular mb-5 text-3xl font-semibold">{rs(est.total)}</p>
              <Button size="large" className="w-full" loading={busy} onClick={generate}>Generate bill</Button>
              <p className="mt-3 text-xs text-ink-faint">This assigns the bill number. Apply any discount first.</p>
            </div>
          ) : !canPay ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5 text-sm text-ink-secondary">A cashier or admin takes the payment.</div>
          ) : (
            <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <p className="text-sm text-ink-secondary">{Number(est.paid) > 0 ? "Left to pay" : "To pay"}</p>
                <p className="tabular text-3xl font-semibold">{rs(remaining)}</p>
              </div>

              <div className="mb-4 grid grid-cols-4 gap-2">
                {METHODS.map((m) => (
                  <button key={m} type="button" onClick={() => setMethod(m)} className={`min-h-12 rounded-xl border text-sm font-medium transition ${method === m ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle text-ink-secondary"}`}>
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-sm font-medium">
                  Amount
                  <button type="button" className="flex items-center gap-1 text-xs font-medium text-brand-strong" onClick={() => setSplitN((n) => (n >= 8 ? 1 : n + 1))}>
                    <IconSplit className="h-3.5 w-3.5" />{splitN > 1 ? `Split ${splitN} ways` : "Split bill"}
                  </button>
                </span>
                <input className="tabular min-h-12 w-full rounded-xl border border-border-strong px-4 text-lg outline-none focus:border-brand" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
              </label>
              {perPerson && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-surface-canvas px-3 py-2 text-sm">
                  <span className="text-ink-secondary">{splitN} people · {rs(perPerson, { decimals: true })} each</span>
                  <button type="button" className="font-medium text-brand-strong" onClick={() => setAmount(String(Math.min(perPerson, remaining)))}>Use</button>
                </div>
              )}

              {method === "cash" ? (
                <div className="mt-4">
                  <p className="mb-1.5 text-sm font-medium">Cash received</p>
                  <div className="mb-2 grid grid-cols-4 gap-2">
                    {quickCash.map((v) => (
                      <button key={v} type="button" onClick={() => setTendered(String(v))} className={`tabular min-h-11 rounded-xl border text-sm font-medium ${Number(tendered) === v ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle"}`}>
                        {v === (amt || remaining) ? "Exact" : v.toLocaleString("en-IN")}
                      </button>
                    ))}
                  </div>
                  <input className="tabular min-h-11 w-full rounded-xl border border-border-strong px-4 outline-none focus:border-brand" inputMode="decimal" placeholder="Or type amount" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))} />
                  {change > 0 && <p className="mt-3 rounded-xl bg-status-success-tint px-4 py-3 text-center text-status-success-ink">Give change <span className="tabular text-xl font-semibold">{rs(change)}</span></p>}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="mb-1.5 text-sm text-ink-secondary">Ask the customer to scan your {METHOD_LABEL[method]} QR, then confirm you received it.</p>
                  <input className="min-h-11 w-full rounded-xl border border-border-strong px-4 text-sm outline-none focus:border-brand" placeholder="Transaction ID / last 4 (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              )}

              <Button size="large" className="mt-5 w-full" icon={<IconCheck />} loading={busy} disabled={!amt} onClick={pay}>
                {amt >= remaining - 0.001 ? `Complete · ${rs(amt)}` : `Take ${rs(amt)} · ${rs(remaining - amt)} left`}
              </Button>
            </div>
          )}
        </section>
      </div>

      <DiscountModal
        open={discountOpen}
        current={order}
        subtotal={Number(est.subtotal)}
        isAdmin={role === "admin"}
        onClose={() => setDiscountOpen(false)}
        onApply={async (body) => {
          const ok = await call("discount", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (ok) {
            setDiscountOpen(false);
            showToast(body.value ? "Discount applied" : "Discount removed");
            load();
          }
        }}
      />
    </main>
  );
}

function Row({ l, v, tone }: { l: string; v: string; tone?: "success" | "muted" }) {
  const neg = v.startsWith("-");
  return (
    <div className={`flex justify-between ${tone === "success" ? "text-status-success-ink" : tone === "muted" ? "text-ink-faint" : "text-ink-secondary"}`}>
      <dt className="truncate pr-3">{l}</dt>
      <dd className="tabular">{neg ? "−" : ""}{rs(neg ? v.slice(1) : v, { decimals: true })}</dd>
    </div>
  );
}

function DiscountModal({ open, current, subtotal, isAdmin, onClose, onApply }: {
  open: boolean; current: Order; subtotal: number; isAdmin: boolean; onClose: () => void;
  onApply: (b: { type: "percent" | "flat"; value: number; reason: string }) => void;
}) {
  const [type, setType] = useState<"percent" | "flat">("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!open) return;
    setType(current.discountType ?? "percent");
    setValue(current.discountValue ? String(Number(current.discountValue)) : "");
    setReason(current.discountReason ?? "");
  }, [open, current]);
  const v = Number(value || 0);
  const off = type === "percent" ? (subtotal * Math.min(v, 100)) / 100 : Math.min(v, subtotal);
  const needsAdmin = !isAdmin && type === "percent" && v > 20;

  return (
    <Modal open={open} onClose={onClose} title="Discount" size="sm">
      <div className="mb-4 inline-flex rounded-lg bg-surface-sunken p-0.5">
        {(["percent", "flat"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`rounded-md px-4 py-2 text-sm font-medium ${type === t ? "bg-surface-raised shadow-sm" : "text-ink-secondary"}`}>{t === "percent" ? "%" : "Rs"}</button>
        ))}
      </div>
      {type === "percent" && (
        <div className="mb-3 grid grid-cols-4 gap-2">
          {[5, 10, 15, 20].map((p) => <button key={p} type="button" onClick={() => setValue(String(p))} className={`min-h-11 rounded-xl border text-sm font-medium ${v === p ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle"}`}>{p}%</button>)}
        </div>
      )}
      <input className="tabular min-h-11 w-full rounded-xl border border-border-strong px-4 outline-none focus:border-brand" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder={type === "percent" ? "Percent" : "Amount in Rs"} />
      <p className="mb-2 mt-4 text-sm font-medium">Reason</p>
      <div className="mb-2 flex flex-wrap gap-2">
        {DISCOUNT_REASONS.map((r) => <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full border px-3 py-1.5 text-xs ${reason === r ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle text-ink-secondary"}`}>{r}</button>)}
      </div>
      <input className="min-h-11 w-full rounded-xl border border-border-strong px-4 text-sm outline-none focus:border-brand" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="Or type a reason" />
      {v > 0 && <p className="mt-4 text-sm text-ink-secondary">Customer saves <span className="tabular font-semibold text-ink-primary">{rs(off, { decimals: true })}</span></p>}
      {needsAdmin && <p className="mt-2 text-sm text-status-warning-ink">Discounts above 20% need an admin.</p>}
      <div className="mt-6 flex justify-between gap-2">
        {current.discountType ? <Button variant="ghost" onClick={() => onApply({ type, value: 0, reason: "Removed" })}>Remove discount</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!v || !reason.trim() || needsAdmin} onClick={() => onApply({ type, value: v, reason: reason.trim() })}>Apply</Button>
        </div>
      </div>
    </Modal>
  );
}
