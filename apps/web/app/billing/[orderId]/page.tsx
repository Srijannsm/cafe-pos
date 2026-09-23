"use client";

import { Fragment, useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getCurrentUser } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { NavBar } from "../../../components/NavBar";
import { IconBanknote, IconCheck, IconInfo, IconQrCode } from "../../../components/icons";
import { Button } from "../../../components/ui/Button";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { PriceDisplay } from "../../../components/ui/PriceDisplay";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorState } from "../../../components/ui/ErrorState";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { InlineAlert } from "../../../components/ui/InlineAlert";

type Modifier = { name: string; priceDelta: string };
type OrderItemModifier = { id: number; modifier: Modifier };
type OrderItem = {
  id: number;
  quantity: number;
  price: string;
  menuItem: { name: string };
  orderItemModifiers: OrderItemModifier[];
};

type Order = {
  id: number;
  status: "pending" | "preparing" | "served" | "billed" | "paid";
  total: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  billNumber: number | null;
  table: { tableNumber: string };
  cafe: { vatEnabled: boolean; vatRate: string; panNumber: string | null } | null;
  orderItems: OrderItem[];
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: IconBanknote },
  { value: "esewa_qr", label: "eSewa QR", icon: IconQrCode },
  { value: "khalti_qr", label: "Khalti QR", icon: IconQrCode },
  { value: "fonepay_qr", label: "FonePay QR", icon: IconQrCode },
] as const;

export default function BillingPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const ready = useRequireAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [billing, setBilling] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [payingMethod, setPayingMethod] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    apiFetchJson<Order>(`/orders/${orderId}`)
      .then((data) => {
        setOrder(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [ready, orderId]);

  async function refresh() {
    const updated = await apiFetchJson<Order>(`/orders/${orderId}`);
    setOrder(updated);
  }

  async function handleGenerateBill() {
    setError("");
    setBilling(true);
    try {
      await apiFetchJson(`/orders/${orderId}/bill`, { method: "PATCH" });
      await refresh();
    } catch {
      setError("Could not generate the bill.");
    } finally {
      setBilling(false);
    }
  }

  async function handleReopen() {
    setError("");
    setReopening(true);
    try {
      await apiFetchJson(`/orders/${orderId}/reopen`, { method: "PATCH" });
      await refresh();
    } catch {
      setError("Could not send this order back to the waiter.");
    } finally {
      setReopening(false);
    }
  }

  async function handlePay(method: string) {
    setError("");
    setPayingMethod(method);
    try {
      await apiFetchJson(`/orders/${orderId}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      router.push(`/billing/${orderId}/receipt`);
    } catch {
      setError("Could not record payment.");
    } finally {
      setPayingMethod(null);
    }
  }

  if (!ready || (!order && !loadError)) {
    return (
      <main className="min-h-screen">
        <NavBar />
        <div className="mx-auto max-w-md p-4 sm:p-6">
          <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-raised shadow-sm">
            <div className="flex flex-col items-center gap-2 border-b-2 border-dashed border-border-subtle p-5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-1 h-5 w-16 rounded-pill" />
            </div>
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-baseline justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t-2 border-dashed border-border-subtle px-5 py-4">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
          <div className="mt-6">
            <Skeleton className="h-14 w-full rounded-pill" />
          </div>
        </div>
      </main>
    );
  }

  if (loadError && !order) {
    return (
      <main className="min-h-screen">
        <NavBar />
        <div className="mx-auto max-w-md p-4 sm:p-6">
          <ErrorState
            title="Couldn't load this order"
            description="The order details didn't come through — check your connection and try again."
            onRetry={() => {
              setLoadError(false);
              apiFetchJson<Order>(`/orders/${orderId}`)
                .then((data) => {
                  setOrder(data);
                  setLoadError(false);
                })
                .catch(() => setLoadError(true));
            }}
          />
        </div>
      </main>
    );
  }

  if (!order) return null;

  const role = getCurrentUser()?.role;
  const canBill = role === "admin" || role === "cashier";

  if (order.status === "paid") {
    return (
      <main className="min-h-screen">
        <NavBar />
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 pt-16 text-center">
          <div className="animate-pop flex h-20 w-20 items-center justify-center rounded-full bg-status-success-tint">
            <IconCheck className="h-10 w-10 text-status-success-ink" />
          </div>
          <h1 className="heading-lg text-ink-primary">Payment received</h1>
          <p className="body-md text-ink-secondary">
            {order.table.tableNumber} · Order #{order.id}
            {order.total && (
              <>
                {" "}
                · <PriceDisplay amount={order.total} />
              </>
            )}
          </p>
          <Button onClick={() => router.push("/")} className="mt-4 w-full">
            Back to tables
          </Button>
        </div>
      </main>
    );
  }

  const itemRows = order.orderItems.map((item) => {
    const unitPrice = Number(item.price ?? 0);
    const modDelta = (item.orderItemModifiers ?? []).reduce(
      (sum, oim) => sum + Number(oim.modifier.priceDelta),
      0,
    );
    const effectiveUnit = unitPrice + modDelta;
    const lineTotal = effectiveUnit * item.quantity;
    return { item, unitPrice, modDelta, effectiveUnit, lineTotal };
  });

  const vatEnabled = order.cafe?.vatEnabled ?? false;
  const vatRate = order.cafe?.vatRate ? Number(order.cafe.vatRate) : 13;

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="mx-auto max-w-md p-4 sm:p-6">
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-raised shadow-sm">
          {/* Header */}
          <div className="border-b-2 border-dashed border-border-subtle p-5 text-center">
            <p className="label-sm text-ink-faint">Cafe POS</p>
            <h1 className="heading-lg mt-1 text-ink-primary">Table {order.table.tableNumber}</h1>
            <p className="body-md text-ink-secondary">
              Order #{order.id}{order.billNumber ? ` · Bill #${order.billNumber}` : ""}
            </p>
            <div className="mt-2 inline-block">
              <StatusBadge tone="neutral">{order.status}</StatusBadge>
            </div>
          </div>

          {/* Items with prices */}
          <div className="p-5">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="label-sm pb-2 pr-2 text-left text-ink-faint">Item</th>
                  <th className="label-sm pb-2 px-2 text-right text-ink-faint">Qty</th>
                  <th className="label-sm pb-2 px-2 text-right text-ink-faint">Unit</th>
                  <th className="label-sm pb-2 pl-2 text-right text-ink-faint">Total</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map(({ item, effectiveUnit, lineTotal }) => (
                  <Fragment key={item.id}>
                    <tr>
                      <td className="body-md py-1.5 pr-2 text-ink-primary">{item.menuItem.name}</td>
                      <td className="body-md tabular-nums py-1.5 px-2 text-right text-ink-secondary">
                        {item.quantity}
                      </td>
                      <td className="body-md tabular-nums py-1.5 px-2 text-right text-ink-secondary">
                        {effectiveUnit.toFixed(2)}
                      </td>
                      <td className="body-md tabular-nums py-1.5 pl-2 text-right font-medium text-ink-primary">
                        {lineTotal.toFixed(2)}
                      </td>
                    </tr>
                    {(item.orderItemModifiers ?? []).map((oim) => (
                      <tr key={oim.id}>
                        <td className="label-sm py-0.5 pl-4 text-ink-faint" colSpan={3}>
                          + {oim.modifier.name}
                        </td>
                        <td className="label-sm tabular-nums py-0.5 pl-2 text-right text-ink-faint">
                          +{Number(oim.modifier.priceDelta).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals — show VAT breakdown when applicable */}
          {order.total && (
            <div className="border-t-2 border-dashed border-border-subtle px-5 pb-5 pt-4 space-y-1.5">
              {vatEnabled && order.subtotal ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="label-sm text-ink-faint">Subtotal</span>
                    <span className="body-md tabular-nums text-ink-secondary">
                      {Number(order.subtotal).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="label-sm text-ink-faint">VAT ({vatRate}%)</span>
                    <span className="body-md tabular-nums text-ink-secondary">
                      {Number(order.vatAmount ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border-subtle">
                    <span className="label-md text-ink-secondary">Total</span>
                    <PriceDisplay amount={order.total} size="lg" />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="label-md text-ink-secondary">Total</span>
                  <PriceDisplay amount={order.total} size="lg" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6">
          {(order.status === "served" || order.status === "billed") && !canBill && (
            <InlineAlert tone="info" icon={<IconInfo className="h-5 w-5 shrink-0" />}>
              This order is ready to be billed — please ask a cashier to complete this.
            </InlineAlert>
          )}

          {order.status === "served" && canBill && (
            <Button onClick={handleGenerateBill} loading={billing} size="large" className="w-full">
              {billing ? "Generating bill..." : "Generate bill"}
            </Button>
          )}

          {order.status === "billed" && canBill && (
            <div>
              <p className="label-md mb-3 text-ink-secondary">Select payment method</p>
              <div className="grid grid-cols-2 gap-3">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => handlePay(method.value)}
                    disabled={payingMethod !== null}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised p-4 shadow-sm transition hover:border-brand hover:bg-brand-tint active:scale-95 disabled:opacity-50"
                  >
                    <method.icon className="h-6 w-6 text-ink-secondary" />
                    <span className="body-md font-semibold text-ink-primary">
                      {payingMethod === method.value ? "Recording..." : method.label}
                    </span>
                  </button>
                ))}
              </div>
              <Button
                onClick={() => setConfirmReopen(true)}
                disabled={reopening || payingMethod !== null}
                variant="secondary"
                className="mt-3 w-full"
              >
                {reopening ? "Sending back..." : "Customer wants to add something — send back"}
              </Button>
            </div>
          )}
        </div>

        {error && <InlineAlert className="mt-4">{error}</InlineAlert>}
      </div>

      <ConfirmDialog
        open={confirmReopen}
        title="Send this order back?"
        description="The bill will be undone and the order sent back to the waiter so items can be added. You'll need to bill again afterwards."
        confirmLabel="Send back"
        tone="warning"
        onConfirm={() => {
          setConfirmReopen(false);
          handleReopen();
        }}
        onCancel={() => setConfirmReopen(false)}
      />
    </main>
  );
}
