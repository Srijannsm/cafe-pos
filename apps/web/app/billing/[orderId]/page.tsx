"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getCurrentUser } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { NavBar } from "../../../components/NavBar";
import { IconAlert, IconBanknote, IconCheck, IconInfo, IconQrCode } from "../../../components/icons";

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
      await refresh();
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
          <div className="h-96 animate-pulse rounded-2xl bg-stone-200" />
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
          <div className="animate-pop flex h-20 w-20 items-center justify-center rounded-full bg-success-subtle">
            <IconCheck className="h-10 w-10 text-success-subtle-fg" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Payment received</h1>
          <p className="text-stone-500">
            {order.table.tableNumber} · Order #{order.id}
            {order.total && (
              <>
                {" "}
                · <span className="font-semibold text-stone-700">रु {order.total}</span>
              </>
            )}
          </p>
          <button onClick={() => router.push("/")} className="btn btn-primary mt-4 w-full">
            Back to tables
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="mx-auto max-w-md p-4 sm:p-6">
        {/* Receipt card */}
        <div className="card overflow-hidden">
          <div className="border-b-2 border-dashed border-stone-200 p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-stone-400">Cafe POS</p>
            <h1 className="mt-1 text-xl font-bold text-stone-900">{order.table.tableNumber}</h1>
            <p className="text-sm text-stone-500">Order #{order.id}</p>
            <span className="badge mt-2 bg-stone-200 text-stone-700">{order.status}</span>
          </div>

          <div className="space-y-2 p-5">
            {order.orderItems.map((item) => (
              <div key={item.id} className="flex items-baseline justify-between text-sm">
                <span className="text-stone-700">
                  {item.quantity}× {item.menuItem.name}
                </span>
                <span className="flex-1 border-b border-dotted border-stone-300 mx-2 translate-y-[-3px]" />
              </div>
            ))}
          </div>

          {order.total && (
            <div className="flex items-center justify-between border-t-2 border-dashed border-stone-200 px-5 py-4">
              <span className="text-sm font-bold uppercase tracking-wide text-stone-500">Total</span>
              <span className="tabular-nums text-xl font-bold text-stone-900">रु {order.total}</span>
            </div>
          )}
        </div>

        <div className="mt-6">
          {(order.status === "served" || order.status === "billed") && !canBill && (
            <div className="flex items-center gap-2 rounded-xl bg-info-subtle px-4 py-3 text-sm font-medium text-info-subtle-fg">
              <IconInfo className="h-5 w-5 shrink-0" />
              This order is ready to be billed — please ask a cashier to complete this.
            </div>
          )}

          {order.status === "served" && canBill && (
            <button onClick={handleGenerateBill} disabled={billing} className="btn btn-primary w-full">
              {billing ? "Generating bill…" : "Generate bill"}
            </button>
          )}

          {order.status === "billed" && canBill && (
            <div>
              <p className="mb-3 text-sm font-semibold text-stone-500">Select payment method</p>
              <div className="grid grid-cols-2 gap-3">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    onClick={() => handlePay(method.value)}
                    disabled={payingMethod !== null}
                    className="card flex flex-col items-center gap-2 p-4 transition hover:border-primary hover:bg-primary-subtle active:scale-95 disabled:opacity-50"
                  >
                    <method.icon className="h-6 w-6 text-stone-600" />
                    <span className="text-sm font-semibold text-stone-800">
                      {payingMethod === method.value ? "Recording…" : method.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-danger-subtle px-3 py-2 text-sm font-medium text-danger-subtle-fg">
            <IconAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
