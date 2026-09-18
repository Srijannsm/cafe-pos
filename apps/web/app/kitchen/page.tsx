"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { NavBar } from "../../components/NavBar";

type OrderItem = {
  id: number;
  quantity: number;
  status: "pending" | "ready" | "served";
  menuItem: { name: string };
  orderItemModifiers: { id: number; modifier: { name: string } }[];
};

type KitchenOrder = {
  id: number;
  table: { tableNumber: string };
  orderItems: OrderItem[];
};

export default function KitchenPage() {
  const ready = useRequireAuth();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);

  const loadOrders = useCallback(() => {
    return apiFetchJson<KitchenOrder[]>("/orders?status=preparing").then(setOrders);
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadOrders();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [ready, loadOrders]);

  async function markReady(orderItemId: number) {
    await apiFetchJson(`/orders/items/${orderItemId}/ready`, { method: "PATCH" });
    loadOrders();
  }

  if (!ready) return <main className="p-6">Loading kitchen...</main>;

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Kitchen</h1>

        {orders.length === 0 && <p className="text-gray-500">No orders in the kitchen right now.</p>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl border border-gray-300 p-4">
              <div className="mb-3 font-medium">
                {order.table.tableNumber} — Order #{order.id}
              </div>
              <div className="grid gap-2">
                {order.orderItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-2">
                    <div>
                      <div>
                        {item.quantity}x {item.menuItem.name}
                      </div>
                      {item.orderItemModifiers.length > 0 && (
                        <div className="text-xs text-gray-500">
                          {item.orderItemModifiers.map((oim) => oim.modifier.name).join(", ")}
                        </div>
                      )}
                    </div>
                    {item.status === "pending" ? (
                      <button
                        onClick={() => markReady(item.id)}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
                      >
                        Mark ready
                      </button>
                    ) : (
                      <span className="text-xs font-semibold uppercase text-green-600">{item.status}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
