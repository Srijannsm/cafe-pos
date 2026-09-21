"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useOrdersSocket } from "../../lib/useOrdersSocket";
import { NavBar } from "../../components/NavBar";
import { IconClock, IconInbox } from "../../components/icons";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";

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

function urgencyLevel(minutes: number): "none" | "warning" | "danger" {
  if (minutes >= 20) return "danger";
  if (minutes >= 10) return "warning";
  return "none";
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

  // Push: a waiter's "Send to Kitchen" shows up here immediately instead of
  // waiting for the next 5s poll. The poll above stays as a fallback.
  useOrdersSocket(ready, {
    onSentToKitchen: () => loadOrders(),
  });

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
    <main data-theme="dark" className="min-h-screen bg-surface-canvas">
      <NavBar />
      <div className="p-4 sm:p-6">
        <h1 className="display-md mb-6 text-ink-primary">Kitchen</h1>

        {!ready || initialLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg bg-surface-sunken" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-raised py-20 text-center">
            <IconInbox className="h-12 w-12 text-ink-faint" />
            <p className="body-lg text-ink-secondary">No orders in the kitchen right now.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => {
              const minutes = elapsedMinutes(order.createdAt);
              const level = urgencyLevel(minutes);
              return (
                <Card
                  key={order.id}
                  tone={level === "none" ? undefined : level}
                  title={
                    <>
                      {order.table.tableNumber} <span className="text-ink-faint">#{order.id}</span>
                    </>
                  }
                  action={
                    <StatusBadge tone={level === "none" ? "neutral" : level} icon={IconClock}>
                      {minutes < 1 ? "just now" : `${minutes}m`}
                    </StatusBadge>
                  }
                >
                  <div className="grid gap-2">
                    {order.orderItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-md p-3 transition-colors ${
                          item.status === "pending" ? "bg-surface-sunken" : "bg-status-success-tint"
                        }`}
                      >
                        <div className="mb-2">
                          <div className="body-lg font-semibold text-ink-primary">
                            {item.quantity}× {item.menuItem.name}
                          </div>
                          {item.orderItemModifiers.length > 0 && (
                            <div className="body-sm text-ink-secondary">
                              {item.orderItemModifiers.map((oim) => oim.modifier.name).join(", ")}
                            </div>
                          )}
                        </div>
                        {item.status === "pending" ? (
                          <Button onClick={() => markReady(item.id)} className="w-full">
                            Mark ready
                          </Button>
                        ) : (
                          <StatusBadge tone="success">Ready</StatusBadge>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
