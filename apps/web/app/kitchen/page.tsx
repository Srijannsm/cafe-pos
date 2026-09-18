"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { NavBar } from "../../components/NavBar";
import { IconCheck, IconClock, IconInbox } from "../../components/icons";

type OrderItem = {
  id: number;
  quantity: number;
  status: "pending" | "ready" | "served";
  menuItem: { name: string };
  orderItemModifiers: { id: number; modifier: { name: string } }[];
};

type KitchenOrder = {
  id: number;
  createdAt: string;
  table: { tableNumber: string };
  orderItems: OrderItem[];
};

function elapsedMinutes(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
}

function urgencyClass(minutes: number): string {
  if (minutes >= 20) return "border-danger bg-danger-subtle text-danger-subtle-fg";
  if (minutes >= 10) return "border-amber-300 bg-warning-subtle text-warning-subtle-fg";
  return "border-stone-200 bg-stone-100 text-stone-500";
}

export default function KitchenPage() {
  const ready = useRequireAuth();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadOrders = useCallback(() => {
    return apiFetchJson<KitchenOrder[]>("/orders?status=preparing").then(setOrders);
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadOrders().finally(() => setInitialLoading(false));
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [ready, loadOrders]);

  async function markReady(orderItemId: number) {
    setOrders((current) =>
      current.map((order) => ({
        ...order,
        orderItems: order.orderItems.map((item) =>
          item.id === orderItemId ? { ...item, status: "ready" as const } : item,
        ),
      })),
    );
    try {
      await apiFetchJson(`/orders/items/${orderItemId}/ready`, { method: "PATCH" });
    } finally {
      loadOrders();
    }
  }

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-bold text-stone-900">Kitchen</h1>

        {!ready || initialLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-stone-200" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white py-20 text-center">
            <IconInbox className="h-12 w-12 text-stone-300" />
            <p className="text-lg text-stone-500">No orders in the kitchen right now.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => {
              const minutes = elapsedMinutes(order.createdAt);
              return (
                <div key={order.id} className="animate-card-in card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                    <div className="text-lg font-bold text-stone-900">
                      {order.table.tableNumber} <span className="text-stone-400">#{order.id}</span>
                    </div>
                    <span
                      className={`badge normal-case border ${urgencyClass(minutes)}`}
                    >
                      <IconClock className="h-3.5 w-3.5" />
                      {minutes < 1 ? "just now" : `${minutes}m`}
                    </span>
                  </div>
                  <div className="grid gap-2 p-4">
                    {order.orderItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between gap-3 rounded-xl p-3 transition-colors ${
                          item.status === "pending" ? "bg-stone-50" : "bg-success-subtle"
                        }`}
                      >
                        <div>
                          <div className="text-base font-semibold text-stone-900">
                            {item.quantity}× {item.menuItem.name}
                          </div>
                          {item.orderItemModifiers.length > 0 && (
                            <div className="text-sm text-stone-500">
                              {item.orderItemModifiers.map((oim) => oim.modifier.name).join(", ")}
                            </div>
                          )}
                        </div>
                        {item.status === "pending" ? (
                          <button onClick={() => markReady(item.id)} className="btn btn-primary shrink-0">
                            Mark ready
                          </button>
                        ) : (
                          <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-success-subtle-fg">
                            <IconCheck className="h-4 w-4" /> Ready
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
