"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useOrdersSocket } from "../../lib/useOrdersSocket";
import { NavBar } from "../../components/NavBar";
import { IconClock, IconInbox, IconAlert } from "../../components/icons";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";

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
  const [loadError, setLoadError] = useState(false);
  const [, setTick] = useState(0); // drives per-second re-render for live timers
  const [exitingIds, setExitingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadOrders = useCallback(() => {
    return apiFetchJson<KitchenOrder[]>("/orders?status=preparing")
      .then((res) => {
        // Don't restore cards that are in the middle of their exit animation
        setExitingIds((exiting) => {
          setOrders(res.filter((o) => !exiting.has(o.id)));
          return exiting;
        });
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadOrders().finally(() => setInitialLoading(false));
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [ready, loadOrders]);

  // Push: a waiter's "Send to Kitchen" shows up here immediately instead of
  // waiting for the next 5s poll. The poll above stays as a fallback.
  const { connected } = useOrdersSocket(ready, {
    onSentToKitchen: () => loadOrders(),
  });

  async function markReady(orderItemId: number) {
    // Optimistically update item status
    setOrders((current) => {
      const updated = current.map((order) => ({
        ...order,
        orderItems: order.orderItems.map((item) =>
          item.id === orderItemId ? { ...item, status: "ready" as const } : item,
        ),
      }));
      // If all items on this order are now ready, trigger slide-out animation
      for (const order of updated) {
        const allReady = order.orderItems.length > 0 && order.orderItems.every((i) => i.status === "ready");
        if (allReady && order.orderItems.some((i) => i.id === orderItemId)) {
          setExitingIds((prev) => new Set([...prev, order.id]));
          // Remove from list after animation completes
          setTimeout(() => {
            setOrders((curr) => curr.filter((o) => o.id !== order.id));
            setExitingIds((prev) => { const s = new Set(prev); s.delete(order.id); return s; });
          }, 400);
        }
      }
      return updated;
    });
    try {
      await apiFetchJson(`/orders/items/${orderItemId}/ready`, { method: "PATCH" });
    } finally {
      // Delay refresh so exiting cards finish their slide-out before the poll
      // can restore them. The 5s interval + socket handles fresh orders anyway.
      setTimeout(loadOrders, 500);
    }
  }

  return (
    <main id="main-content" data-theme="dark" className="min-h-screen bg-surface-canvas">
      <NavBar />
      <div className="p-4 sm:p-6">
        <h1 className="display-md mb-4 text-ink-primary">Kitchen</h1>

        {ready && !connected && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-status-warning bg-status-warning-tint px-4 py-3 text-sm font-medium text-status-warning-ink">
            <IconAlert className="h-4 w-4 shrink-0" />
            Live updates disconnected — new orders will still appear every 5 seconds.
          </div>
        )}

        {!ready || initialLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border-subtle bg-surface-raised p-4">
                <div className="mb-4 flex items-center justify-between">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16 rounded-pill" />
                </div>
                <div className="space-y-2">
                  <Skeleton variant="rect" className="h-20 w-full rounded-md" />
                  <Skeleton variant="rect" className="h-20 w-full rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <ErrorState
            title="Couldn't load orders"
            description="The kitchen queue didn't come through — check your connection and try again."
            onRetry={() => {
              setInitialLoading(true);
              loadOrders().finally(() => setInitialLoading(false));
            }}
          />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<IconInbox className="h-6 w-6" />}
            title="No orders in the kitchen right now"
            description="Orders will show up here once a waiter sends them to the kitchen."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => {
              const minutes = elapsedMinutes(order.createdAt);
              const level = urgencyLevel(minutes);
              return (
                <Card
                  key={order.id}
                  tone={level === "none" ? undefined : level}
                  className={exitingIds.has(order.id) ? "animate-slide-out-left opacity-0 transition-opacity duration-400" : "animate-card-in"}
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
