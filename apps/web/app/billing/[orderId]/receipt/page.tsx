"use client";

import { Fragment, use, useState, useEffect } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../../../lib/api";
import { useRequireAuth } from "../../../../lib/useRequireAuth";
import { NavBar } from "../../../../components/NavBar";
import { IconInfo } from "../../../../components/icons";
import { Button } from "../../../../components/ui/Button";
import { PriceDisplay } from "../../../../components/ui/PriceDisplay";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { ErrorState } from "../../../../components/ui/ErrorState";

type Modifier = { name: string; priceDelta: string };
type OrderItemModifier = { id: number; modifier: Modifier };
type OrderItem = {
  id: number;
  quantity: number;
  price: string;
  menuItem: { name: string };
  orderItemModifiers: OrderItemModifier[];
};
type Payment = { method: "cash" | "esewa_qr" | "khalti_qr" | "fonepay_qr"; paidAt: string };

type Cafe = {
  name: string;
  vatEnabled: boolean;
  vatRate: string;
  panNumber: string | null;
};

type Order = {
  id: number;
  status: "pending" | "preparing" | "served" | "billed" | "paid";
  total: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  billNumber: number | null;
  createdAt: string;
  table: { tableNumber: string };
  waiter: { name: string } | null;
  cafe?: Cafe;
  orderItems: OrderItem[];
  payments: Payment[];
};

const PAYMENT_METHOD_LABELS: Record<Payment["method"], string> = {
  cash: "Cash",
  esewa_qr: "eSewa QR",
  khalti_qr: "Khalti QR",
  fonepay_qr: "FonePay QR",
};

export default function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const ready = useRequireAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState(false);

  function fetchOrder() {
    apiFetchJson<Order>(`/orders/${orderId}`)
      .then(setOrder)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    if (!ready) return;
    fetchOrder();
  }, [ready, orderId]);

  if (!ready || (!order && !loadError)) {
    return (
      <main className="min-h-screen">
        <div className="print:hidden">
          <NavBar />
        </div>
        <div className="mx-auto max-w-md p-4 sm:p-6">
          {loadError ? (
            <ErrorState
              title="Couldn't load receipt"
              description="The receipt didn't come through — check your connection and try again."
              onRetry={() => {
                setLoadError(false);
                fetchOrder();
              }}
            />
          ) : (
            <div className="space-y-4">
              <Skeleton variant="rect" className="mx-auto h-6 w-32 rounded-md" />
              <Skeleton variant="rect" className="h-48 w-full rounded-lg" />
              <Skeleton variant="rect" className="h-12 w-full rounded-md" />
              <Skeleton variant="rect" className="h-12 w-full rounded-md" />
            </div>
          )}
        </div>
      </main>
    );
  }

  if (order && order.status !== "paid") {
    return (
      <main className="min-h-screen">
        <div className="print:hidden">
          <NavBar />
        </div>
        <div className="mx-auto max-w-md p-4 sm:p-6">
          <div className="body-md flex items-center gap-2 rounded-md bg-status-info-tint px-4 py-3 text-status-info-ink">
            <IconInfo className="h-5 w-5 shrink-0" />
            This order hasn&apos;t been paid yet — there&apos;s no receipt to show.
          </div>
          <Link href={`/billing/${orderId}`} className="mt-4 inline-block">
            <Button variant="secondary">Back to order</Button>
          </Link>
        </div>
      </main>
    );
  }

  if (!order) return null;

  const payment = order.payments[0];
  const cafeName = order.cafe?.name ?? "Cafe POS";
  const vatEnabled = order.cafe?.vatEnabled ?? false;
  const vatRate = order.cafe?.vatRate ? Number(order.cafe.vatRate) : 13;
  const panNumber = order.cafe?.panNumber ?? null;

  return (
    <main className="min-h-screen">
      <div className="print:hidden">
        <NavBar />
      </div>

      <div className="mx-auto max-w-md p-4 sm:p-6 print:p-0">
        <div className="receipt-print overflow-hidden rounded-lg border border-border-subtle bg-surface-raised p-5 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          {/* Header */}
          <div className="border-b-2 border-dashed border-border-subtle pb-4 text-center">
            {vatEnabled && (
              <p className="label-sm mb-1 font-bold uppercase tracking-widest text-ink-primary">
                Tax Invoice
              </p>
            )}
            <p className="heading-md text-ink-primary">{cafeName}</p>
            {vatEnabled && panNumber && (
              <p className="body-sm mt-0.5 text-ink-secondary">PAN: {panNumber}</p>
            )}
            <p className="body-sm mt-1 text-ink-secondary">Table {order.table.tableNumber}</p>
            {order.billNumber && (
              <p className="order-code mt-1 text-ink-primary">Bill #{order.billNumber}</p>
            )}
            {payment && (
              <p className="body-sm mt-1 text-ink-faint">{new Date(payment.paidAt).toLocaleString()}</p>
            )}
            {order.waiter && (
              <p className="body-sm text-ink-faint">Served by {order.waiter.name}</p>
            )}
          </div>

          {/* Items */}
          <table className="w-full border-collapse py-3">
            <thead>
              <tr>
                <th className="label-sm py-2 pr-2 text-left text-ink-faint">Item</th>
                <th className="label-sm py-2 px-2 text-right text-ink-faint">Qty</th>
                <th className="label-sm py-2 px-2 text-right text-ink-faint">Unit</th>
                <th className="label-sm py-2 pl-2 text-right text-ink-faint">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.orderItems.map((item) => {
                const unitPrice = Number(item.price ?? 0);
                const modifierTotal = (item.orderItemModifiers ?? []).reduce(
                  (sum, oim) => sum + Number(oim.modifier.priceDelta),
                  0,
                );
                const effectiveUnit = unitPrice + modifierTotal;
                const lineTotal = effectiveUnit * item.quantity;
                return (
                  <Fragment key={item.id}>
                    <tr>
                      <td className="body-sm py-1 pr-2 text-ink-primary">{item.menuItem.name}</td>
                      <td className="body-sm tabular-nums py-1 px-2 text-right text-ink-secondary">
                        {item.quantity}
                      </td>
                      <td className="body-sm tabular-nums py-1 px-2 text-right text-ink-secondary">
                        {effectiveUnit.toFixed(2)}
                      </td>
                      <td className="body-sm tabular-nums py-1 pl-2 text-right text-ink-primary">
                        {lineTotal.toFixed(2)}
                      </td>
                    </tr>
                    {(item.orderItemModifiers ?? []).map((oim) => (
                      <tr key={oim.id}>
                        <td className="body-sm py-0.5 pl-4 text-ink-faint" colSpan={3}>
                          + {oim.modifier.name}
                        </td>
                        <td className="body-sm tabular-nums py-0.5 pl-2 text-right text-ink-faint">
                          +{Number(oim.modifier.priceDelta).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Totals — VAT breakdown when applicable */}
          {vatEnabled && order.subtotal ? (
            <div className="border-t-2 border-dashed border-border-subtle pt-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="label-sm text-ink-faint">Subtotal</span>
                <span className="body-sm tabular-nums text-ink-secondary">
                  {Number(order.subtotal).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="label-sm text-ink-faint">VAT ({vatRate}%)</span>
                <span className="body-sm tabular-nums text-ink-secondary">
                  {Number(order.vatAmount ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1.5">
                <span className="label-md text-ink-secondary">Total</span>
                <PriceDisplay amount={order.total ?? "0"} size="lg" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between border-t-2 border-dashed border-border-subtle pt-4">
              <span className="label-md text-ink-secondary">Total</span>
              <PriceDisplay amount={order.total ?? "0"} size="lg" />
            </div>
          )}

          {/* Payment method */}
          <div className="body-md mt-2 flex items-center justify-between text-ink-secondary">
            <span>Paid via</span>
            <span className="font-semibold text-ink-primary">
              {payment ? PAYMENT_METHOD_LABELS[payment.method] : "—"}
            </span>
          </div>

          <p className="body-sm mt-6 text-center text-ink-faint">Thank you — please visit again!</p>

          {/* Confidential footer — print only */}
          <p className="label-sm mt-4 hidden text-center text-ink-faint print:block">
            {cafeName} · Confidential
          </p>
        </div>

        <div className="print:hidden mt-6 flex items-center justify-between gap-3">
          <Link href="/billing">
            <Button variant="ghost">Back to Billing</Button>
          </Link>
          <Button variant="secondary" onClick={() => window.print()}>
            Print Receipt
          </Button>
        </div>
      </div>
    </main>
  );
}
