"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getCurrentUser } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { NavBar } from "../../../components/NavBar";

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
  { value: "cash", label: "Cash" },
  { value: "esewa_qr", label: "eSewa QR" },
  { value: "khalti_qr", label: "Khalti QR" },
  { value: "fonepay_qr", label: "FonePay QR" },
] as const;

export default function BillingPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const ready = useRequireAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

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
    try {
      await apiFetchJson(`/orders/${orderId}/bill`, { method: "PATCH" });
      await refresh();
    } catch {
      setError("Could not generate the bill.");
    }
  }

  async function handlePay(method: string) {
    setError("");
    try {
      await apiFetchJson(`/orders/${orderId}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      await refresh();
    } catch {
      setError("Could not record payment.");
    }
  }

  if (!ready || !order) return <main className="p-6">Loading order...</main>;

  const role = getCurrentUser()?.role;
  const canBill = role === "admin" || role === "cashier";

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="mx-auto max-w-md p-6">
        <h1 className="mb-1 text-2xl font-semibold">
          {order.table.tableNumber} — Order #{order.id}
        </h1>
        <p className="mb-4 text-sm font-semibold uppercase text-gray-500">{order.status}</p>

        <div className="mb-6 grid gap-2">
          {order.orderItems.map((item) => (
            <div key={item.id} className="rounded-lg bg-gray-50 p-3">
              {item.quantity}x {item.menuItem.name}
            </div>
          ))}
        </div>

        {order.total && <p className="mb-4 text-lg font-semibold">Total: रु {order.total}</p>}

        {(order.status === "served" || order.status === "billed") && !canBill && (
          <p className="text-gray-600">
            This order is ready to be billed — please ask a cashier to complete this.
          </p>
        )}

        {order.status === "served" && canBill && (
          <button onClick={handleGenerateBill} className="rounded-lg bg-blue-600 px-6 py-2 text-white">
            Generate bill
          </button>
        )}

        {order.status === "billed" && canBill && (
          <div className="grid gap-2">
            <p className="text-sm text-gray-600">Select payment method:</p>
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.value}
                onClick={() => handlePay(method.value)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-left hover:bg-gray-50"
              >
                {method.label}
              </button>
            ))}
          </div>
        )}

        {order.status === "paid" && (
          <div>
            <p className="mb-4 font-medium text-green-600">Paid ✓</p>
            <button onClick={() => router.push("/")} className="rounded-lg bg-gray-800 px-6 py-2 text-white">
              Back to tables
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-red-600">{error}</p>}
      </div>
    </main>
  );
}
