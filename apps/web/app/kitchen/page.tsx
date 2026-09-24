"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { useOrdersSocket } from "../../lib/useOrdersSocket";
import { NavBar } from "../../components/NavBar";
import { IconClock, IconInbox, IconAlert, IconCheck } from "../../components/icons";
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

/** Play a short chime using the Web Audio API — no external assets needed. */
function playNewOrderChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  } catch {
    // Silently ignore — AudioContext may not be available in all environments
  }
}

export default function KitchenPage() {
  const ready = useRequireAuth();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [, setTick] = useState(0); // drives per-second re-render for live timers
  const [exitingIds, setExitingIds] = useState<Set<number>>(new Set());
  const [markingAllIds, setMarkingAllIds] = useState<Set<number>>(new Set());
  const knownOrderIds = useRef<Set<number>>(new Set());
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadOrders = useCallback((isInitial = false) => {
    return apiFetchJson<KitchenOrder[]>("/orders?status=preparing")
      .then((res) => {
        setExitingIds((exiting) => {
          const visible = res.filter((o) => !exiting.has(o.id));

          // Play chime for brand-new orders (not on the very first load)
          if (!isFirstLoad.current) {
            const newOnes = visible.filter((o) => !knownOrderIds.current.has(o.id));
            if (newOnes.length > 0) playNewOrderChime();
          }
          isFirstLoad.current = false;

          knownOrderIds.current = new Set(visible.map((o) => o.id));
          setOrders(visible);
          return exiting;
        });
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadOrders(true).finally(() => setInitialLoading(false));
    const interval = setInterval(() => loadOrders(), 5000);
    return () => clearInterval(interval);
  }, [ready, loadOrders]);

  const { connected } = useOrdersSocket(ready, {
    onSentToKitchen: () => loadOrders(),
  });

  /** Trigger exit animation then remove the order card */
  function triggerExit(orderId: number) {
    setExitingIds((prev) => new Set([...prev, orderId]));
    setTimeout(() => {
      setOrders((curr) => curr.filter((o) => o.id !== orderId));
      setExitingIds((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
      knownOrderIds.current.delete(orderId);
    }, 400);
  }

  async function markReady(orderItemId: number) {
    setOrders((current) => {
      const updated = current.map((order) => ({
        ...order,
        orderItems: order.orderItems.map((item) =>
          item.id === orderItemId ? { ...item, status: "ready" as const } : item,
        ),
      }));
      for (const order of updated) {
        const allReady = order.orderItems.length > 0 && order.orderItems.every((i) => i.status === "ready");
        if (allReady && order.orderItems.some((i) => i.id === orderItemId)) {
          triggerExit(order.id);
        }
      }
      return updated;
    });
    try {
      await apiFetchJson(`/orders/items/${orderItemId}/ready`, { method: "PATCH" });
    } finally {
      setTimeout(() => loadOrders(), 500);
    }
  }

  async function markAllReady(order: KitchenOrder) {
    const pendingItems = order.orderItems.filter((i) => i.status === "pending");
    if (pendingItems.length === 0) return;

    setMarkingAllIds((prev) => new Set([...prev, order.id]));

    // Optimistically mark all as ready
    setOrders((current) =>
      current.map((o) =>
        o.id === order.id
          ? { ...o, orderItems: o.orderItems.map((i) => ({ ...i, status: "ready" as const })) }
          : o,
      ),
    );
    triggerExit(order.id);

    try {
      await Promise.all(
        pendingItems.map((item) =>
          apiFetchJson(`/orders/items/${item.id}/ready`, { method: "PATCH" }),
        ),
      );
    } finally {
      setMarkingAllIds((prev) => { const s = new Set(prev); s.delete(order.id); return s; });
      setTimeout(() => loadOrders(), 500);
    }
  }

  return (
    <main id="main-content" data-theme="dark" className="min-h-screen bg-surface-canvas">
      <NavBar />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h1 className="display-md text-ink-primary">Kitchen</h1>
          {orders.length > 0 && (
            <p className="body-sm text-ink-faint">
              {orders.length} order{orders.length !== 1 ? "s" : ""} in queue
            </p>
          )}
        </div>

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
              loadOrders(true).finally(() => setInitialLoading(false));
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
              const readyCount = order.orderItems.filter((i) => i.status === "ready").length;
              const totalCount = order.orderItems.length;
              const allReady = readyCount === totalCount && totalCount > 0;
              const isMarkingAll = markingAllIds.has(order.id);

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
                    <div className="flex items-center gap-2">
                      {/* Item progress pill */}
                      <span
                        className={`label-sm rounded-pill px-2 py-0.5 font-semibold ${
                          allReady
                            ? "bg-status-success-tint text-status-success-ink"
                            : readyCount > 0
                              ? "bg-status-warning-tint text-status-warning-ink"
                              : "bg-surface-sunken text-ink-faint"
                        }`}
                      >
                        {readyCount}/{totalCount}
                      </span>
                      <StatusBadge tone={level === "none" ? "neutral" : level} icon={IconClock}>
                        {minutes < 1 ? "just now" : `${minutes}m`}
                      </StatusBadge>
                    </div>
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

                  {/* Mark all ready — only show when there are multiple pending items */}
                  {order.orderItems.filter((i) => i.status === "pending").length > 1 && (
                    <div className="mt-3 border-t border-border-subtle pt-3">
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={isMarkingAll}
                        onClick={() => markAllReady(order)}
                      >
                        <IconCheck className="h-4 w-4 mr-1.5" />
                        {isMarkingAll ? "Marking all ready…" : "Mark all ready"}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
