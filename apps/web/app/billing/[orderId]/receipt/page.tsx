"use client";

import { Fragment, use, useState, useEffect } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../../../lib/api";
import { useRequireAuth } from "../../../../lib/useRequireAuth";
import { NavBar } from "../../../../components/NavBar";
import { IconInfo } from "../../../../components/icons";
import { Button } from "../../../../components/ui/Button";
import { PriceDisplay } from "../../../../components/ui/PriceDisplay";

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

type Order = {
  id: number;
  status: "pending" | "preparing" | "served" | "billed" | "paid";
  total: string | null;
  createdAt: string;
  table: { tableNumber: string };
  waiter: { name: string } | null;
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

  useEffect(() => {
    if (!ready) return;
    apiFetchJson<Order>(`/orders/${orderId}`).then(setOrder);
  }, [ready, orderId]);

  if (!ready || !order) {
    return (
      <main className="min-h-screen">
        <div className="print:hidden">
          <NavBar />
        </div>
        <div className="mx-auto max-w-md p-4 sm:p-6">
          <div className="h-96 animate-pulse rounded-lg bg-surface-sunken" />
        </div>
      </main>
    );
  }

  if (order.status !== "paid") {
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

  const payment = order.payments[0];

  return (
    <main className="min-h-screen">
      <div className="print:hidden">
        <NavBar />
      </div>

      <div className="mx-auto max-w-md p-4 sm:p-6 print:p-0">
        <div className="receipt-print overflow-hidden rounded-lg border border-border-subtle bg-surface-raised p-5 shadow-sm">
          <div className="border-b-2 border-dashed border-border-subtle pb-4 text-center">
            <p className="heading-md text-ink-primary">Cafe POS</p>
            <p className="body-sm mt-1 text-ink-secondary">{order.table.tableNumber}</p>
            <p className="order-code mt-1 text-ink-primary">Order #{order.id}</p>
            {payment && (
              <p className="body-sm mt-1 text-ink-faint">{new Date(payment.paidAt).toLocaleString()}</p>
            )}
            {order.waiter && <p className="body-sm text-ink-faint">Served by {order.waiter.name}</p>}
          </div>

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
                const unitPrice = Number(item.price);
                const modifierTotal = item.orderItemModifiers.reduce(
                  (sum, oim) => sum + Number(oim.modifier.priceDelta),
                  0,
                );
                const lineTotal = (unitPrice + modifierTotal) * item.quantity;
                return (
                  <Fragment key={item.id}>
                    <tr>
                      <td className="body-sm py-1 pr-2 text-ink-primary">{item.menuItem.name}</td>
                      <td className="body-sm tabular-nums py-1 px-2 text-right text-ink-secondary">
                        {item.quantity}
                      </td>
                      <td className="body-sm tabular-nums py-1 px-2 text-right text-ink-secondary">
                        {unitPrice.toFixed(2)}
                      </td>
                      <td className="body-sm tabular-nums py-1 pl-2 text-right text-ink-primary">
                        {lineTotal.toFixed(2)}
                      </td>
                    </tr>
                    {item.orderItemModifiers.map((oim) => (
                      <tr key={oim.id}>
                        <td className="body-sm py-0.5 pl-4 text-ink-faint" colSpan={3}>
                          + {oim.modifier.name}
                        </td>
                        <td className="body-sm tabular-nums py-0.5 pl-2 text-right text-ink-faint">
                          {Number(oim.modifier.priceDelta).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t-2 border-dashed border-border-subtle pt-4">
            <span className="label-md text-ink-secondary">Total</span>
            <PriceDisplay amount={order.total ?? "0"} size="lg" />
          </div>

          <div className="body-md mt-2 flex items-center justify-between text-ink-secondary">
            <span>Paid via</span>
            <span className="font-semibold text-ink-primary">
              {payment ? PAYMENT_METHOD_LABELS[payment.method] : "—"}
            </span>
          </div>

          <p className="body-sm mt-6 text-center text-ink-faint">Thank you — please visit again!</p>
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
