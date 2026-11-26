"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth, useCurrentUser } from "../../lib/useRequireAuth";
import { useCafeSocket } from "../../lib/useCafeSocket";
import { NavBar } from "../../components/NavBar";
import { useToast } from "../../components/Toast";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { IconReceipt, IconWallet, IconChevronRight, IconCheckCircle } from "../../components/icons";
import { CashMoveModal, CloseShiftModal, OpenShiftModal, ZReport, type ShiftSummary } from "../../components/admin/cash";
import { Modal } from "../../components/ui/Modal";
import { useCafeSettings } from "../../lib/CafeSettingsContext";
import { rs, timeAgo, ago } from "../../lib/format";

type Order = {
  id: number;
  status: "served" | "billed";
  createdAt: string;
  total: string | null;
  billNumber: number | null;
  table: { tableNumber: string };
  waiter: { name: string } | null;
  payments: { amount: string }[];
  orderItems: { quantity: number; price: string; voidedAt: string | null; orderItemModifiers: { modifier: { priceDelta: string } }[] }[];
};
type TableReq = { id: number; type: string; table: { tableNumber: string } };

const estimate = (o: Order) => o.orderItems.filter((i) => !i.voidedAt).reduce((s, i) => s + (Number(i.price) + i.orderItemModifiers.reduce((m, x) => m + Number(x.modifier.priceDelta), 0)) * i.quantity, 0);

// The cashier's home: who's waiting to pay, plus the cash drawer.
export default function BillingCounter() {
  const ready = useRequireAuth();
  const { showToast, toastHost } = useToast();
  const { settings } = useCafeSettings();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [requests, setRequests] = useState<TableReq[]>([]);
  const [shift, setShift] = useState<ShiftSummary | null | undefined>(undefined);
  const [openShift, setOpenShift] = useState(false);
  const [cashMove, setCashMove] = useState(false);
  const [closing, setClosing] = useState(false);
  const [z, setZ] = useState<ShiftSummary | null>(null);
  const role = useCurrentUser()?.role;
  const canCash = role === "admin" || role === "cashier";

  const load = useCallback(async () => {
    try {
      const [served, billed, reqs] = await Promise.all([
        apiFetchJson<Order[]>("/orders?status=served"),
        apiFetchJson<Order[]>("/orders?status=billed"),
        apiFetchJson<TableReq[]>("/tables/requests"),
      ]);
      setOrders([...billed, ...served]);
      setRequests(reqs.filter((r) => r.type === "request_bill"));
    } catch {
      setOrders([]);
    }
    if (canCash) apiFetchJson<ShiftSummary | null>("/shifts/current").then(setShift).catch(() => setShift(null));
  }, [canCash]);

  useEffect(() => {
    if (!ready) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [ready, load]);

  useCafeSocket(ready, {
    "floor.changed": () => load(),
    "table.request": (p: { type: string; tableNumber: string }) => {
      if (p.type === "request_bill") {
        // (sound comes from the NotificationBell)
        showToast(`Table ${p.tableNumber} asked for the bill`, "info");
      }
      load();
    },
  });

  const billed = orders?.filter((o) => o.status === "billed") ?? [];
  const served = orders?.filter((o) => o.status === "served") ?? [];

  return (
    <main className="min-h-screen pb-10">
      {toastHost}
      <NavBar />
      <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Billing</h1>
            <p className="text-sm text-ink-secondary">{billed.length} waiting to pay · {served.length} ready to bill</p>
          </div>
        </div>

        {canCash && shift !== undefined && (
          <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${shift ? "border-border-subtle bg-surface-raised" : "border-status-warning/40 bg-status-warning-tint"}`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken"><IconWallet className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              {shift ? (
                <>
                  <p className="text-sm font-medium">Drawer open · expected <span className="tabular">{rs(shift.expectedCash)}</span></p>
                  <p className="text-xs text-ink-faint">Opened {ago(shift.openedAt)} by {shift.openedBy} · {shift.billsPaid} bills · {rs(shift.totalSales)}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-status-warning-ink">Cash drawer not open</p>
                  <p className="text-xs text-status-warning-ink/80">Open it so cash payments are counted at close.</p>
                </>
              )}
            </div>
            {shift ? (
              <div className="flex gap-2">
                <Button size="small" variant="secondary" onClick={() => setCashMove(true)}>Cash in / out</Button>
                <Button size="small" variant="secondary" onClick={() => setClosing(true)}>Close shift</Button>
              </div>
            ) : <Button size="small" onClick={() => setOpenShift(true)}>Open shift</Button>}
          </div>
        )}

        {requests.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {requests.map((r) => <span key={r.id} className="rounded-full bg-status-danger px-3 py-1.5 text-sm font-semibold text-white">Table {r.table.tableNumber} wants the bill</span>)}
          </div>
        )}

        {orders === null ? (
          <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-surface-raised">
            <EmptyState icon={<IconCheckCircle className="h-6 w-6" />} title="All settled" description="Served tables appear here when they're ready to pay." className="py-16" />
          </div>
        ) : (
          <>
            {[["Waiting to pay", billed], ["Served · ready to bill", served]].map(([label, list]) =>
              (list as Order[]).length ? (
                <section key={label as string}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{label as string}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(list as Order[]).map((o) => {
                      const paid = o.payments.reduce((s, p) => s + Number(p.amount), 0);
                      const amount = o.total ? Number(o.total) - paid : estimate(o);
                      return (
                        <Link key={o.id} href={`/billing/${o.id}`} className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface-raised p-4 transition hover:shadow-md active:scale-[0.99]">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-lg font-semibold">{o.table.tableNumber}</span>
                          <div className="min-w-0 flex-1">
                            <p className="tabular text-lg font-semibold">{rs(amount)}</p>
                            <p className="truncate text-xs text-ink-faint">
                              {o.billNumber ? `Bill #${o.billNumber} · ` : ""}{o.waiter?.name ?? "QR"} · {timeAgo(o.createdAt)}{paid > 0 ? ` · ${rs(paid)} paid` : ""}
                            </p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${o.status === "billed" ? "bg-brand-tint text-brand-strong" : "bg-status-info-tint text-status-info-ink"}`}>
                            {o.status === "billed" ? "Take payment" : "Make bill"}
                          </span>
                          <IconChevronRight className="h-4 w-4 text-ink-faint" />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : null,
            )}
          </>
        )}
        {!canCash && <p className="flex items-center gap-2 text-xs text-ink-faint"><IconReceipt className="h-4 w-4" />Payments are taken by a cashier or admin.</p>}
      </div>

      <OpenShiftModal open={openShift} onClose={() => setOpenShift(false)} onDone={() => { setOpenShift(false); load(); }} onError={(m) => showToast(m, "error")} />
      <CashMoveModal open={cashMove} initialType="expense" onClose={() => setCashMove(false)} onDone={(m) => { setCashMove(false); showToast(m); load(); }} onError={(m) => showToast(m, "error")} />
      <CloseShiftModal open={closing} shift={shift ?? null} onClose={() => setClosing(false)} onDone={(s) => { setClosing(false); setZ(s); load(); }} onError={(m) => showToast(m, "error")} />
      <Modal open={!!z} onClose={() => setZ(null)} title="Shift closed" size="sm">
        {z && <><ZReport s={z} cafeName={settings?.name ?? "Cafe"} /><div className="mt-4 flex justify-end gap-2 print:hidden"><Button variant="secondary" onClick={() => window.print()}>Print</Button><Button onClick={() => setZ(null)}>Done</Button></div></>}
      </Modal>
    </main>
  );
}
