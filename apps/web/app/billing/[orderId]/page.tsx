"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getCurrentUser } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { NavBar } from "../../../components/NavBar";
import { IconAlert, IconBanknote, IconCheck, IconInfo, IconQrCode } from "../../../components/icons";
import { Button } from "../../../components/ui/Button";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { PriceDisplay } from "../../../components/ui/PriceDisplay";

type OrderItem = {
  id: number;
  quantity: number;
  menuItem: { name: string };
};

type Order = {
  id: number;
  status: "pending" | "preparing" | "served" | "billed" | "paid";
  total: string | null;
  table: { tableNumber: string };
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
  const [error, setError] = useState("");
  const [billing, setBilling] = useState(false);
  const [payingMethod, setPayingMethod] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    apiFetchJson<Order>(`/orders/${orderId}`).then(setOrder);
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

  if (!ready || !order) {
    return (
      <main className="min-h-screen">
        <NavBar />
        <div className="mx-auto max-w-md p-4 sm:p-6">
          <div className="h-96 animate-pulse rounded-lg bg-surface-sunken" />
        </div>
      </main>
    );
  }

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

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="mx-auto max-w-md p-4 sm:p-6">
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-raised shadow-sm">
          <div className="border-b-2 border-dashed border-border-subtle p-5 text-center">
            <p className="label-sm text-ink-faint">Cafe POS</p>
            <h1 className="heading-lg mt-1 text-ink-primary">{order.table.tableNumber}</h1>
            <p className="body-md text-ink-secondary">Order #{order.id}</p>
            <div className="mt-2 inline-block">
              <StatusBadge tone="neutral">{order.status}</StatusBadge>
            </div>
          </div>

          <div className="space-y-2 p-5">
            {order.orderItems.map((item) => (
              <div key={item.id} className="body-md flex items-baseline justify-between">
                <span className="text-ink-primary">
                  {item.quantity}× {item.menuItem.name}
                </span>
                <span className="mx-2 flex-1 translate-y-[-3px] border-b border-dotted border-border-strong" />
              </div>
            ))}
          </div>

          {order.total && (
            <div className="flex items-center justify-between border-t-2 border-dashed border-border-subtle px-5 py-4">
              <span className="label-md text-ink-secondary">Total</span>
              <PriceDisplay amount={order.total} size="lg" />
            </div>
          )}
        </div>

        <div className="mt-6">
          {(order.status === "served" || order.status === "billed") && !canBill && (
            <div className="body-md flex items-center gap-2 rounded-md bg-status-info-tint px-4 py-3 text-status-info-ink">
              <IconInfo className="h-5 w-5 shrink-0" />
              This order is ready to be billed — please ask a cashier to complete this.
            </div>
          )}

          {order.status === "served" && canBill && (
            <Button onClick={handleGenerateBill} disabled={billing} size="large" className="w-full">
              {billing ? "Generating bill…" : "Generate bill"}
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
                      {payingMethod === method.value ? "Recording…" : method.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="body-md mt-4 flex items-center gap-2 rounded-md bg-status-danger-tint px-3 py-2 text-status-danger-ink">
            <IconAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
