"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { NavBar } from "../../components/NavBar";
import { IconInbox } from "../../components/icons";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { PriceDisplay } from "../../components/ui/PriceDisplay";

type Order = {
  id: number;
  status: "served" | "billed";
  createdAt: string;
  total: string | null;
  table: { tableNumber: string };
  waiter: { id: number; name: string } | null;
  orderItems: { id: number }[];
};

const STATUS_TONE: Record<Order["status"], "info" | "success"> = {
  served: "info",
  billed: "success",
};

export default function BillingWorklistPage() {
  const ready = useRequireAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    const [served, billed] = await Promise.all([
      apiFetchJson<Order[]>("/orders?status=served"),
      apiFetchJson<Order[]>("/orders?status=billed"),
    ]);
    const merged = [...served, ...billed].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    setOrders(merged);
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadOrders().finally(() => setInitialLoading(false));
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [ready, loadOrders]);

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="p-4 sm:p-6">
        <h1 className="display-md mb-6 text-ink-primary">Billing</h1>

        {!ready || initialLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-surface-sunken" />
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-raised py-20 text-center">
            <IconInbox className="h-12 w-12 text-ink-faint" />
            <p className="body-lg text-ink-secondary">No orders waiting for billing right now.</p>
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="label-sm py-3 pr-4 text-ink-secondary">Table</th>
                    <th className="label-sm py-3 pr-4 text-ink-secondary">Waiter</th>
                    <th className="label-sm py-3 pr-4 text-ink-secondary">Items</th>
                    <th className="label-sm py-3 pr-4 text-ink-secondary">Total</th>
                    <th className="label-sm py-3 pr-4 text-ink-secondary">Status</th>
                    <th className="label-sm py-3 pr-0 text-right text-ink-secondary">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const isReady = order.status === "billed";
                    return (
                      <tr key={order.id} className="border-b border-border-subtle last:border-0">
                        <td className="py-4 pr-4">
                          <span className="order-code text-ink-primary">
                            {order.table.tableNumber} #{order.id}
                          </span>
                        </td>
                        <td className="body-md py-4 pr-4 text-ink-primary">{order.waiter?.name ?? "—"}</td>
                        <td className="body-md py-4 pr-4 text-ink-secondary">
                          {order.orderItems.length} item{order.orderItems.length === 1 ? "" : "s"}
                        </td>
                        <td className="py-4 pr-4">
                          {order.total ? (
                            <PriceDisplay amount={order.total} />
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          <StatusBadge tone={STATUS_TONE[order.status]}>{order.status}</StatusBadge>
                        </td>
                        <td className="py-4 pr-0 text-right">
                          <Link href={`/billing/${order.id}`} className="inline-block">
                            <Button
                              variant={isReady ? "primary" : "secondary"}
                              disabled={!isReady}
                              tabIndex={-1}
                              className="pointer-events-none"
                            >
                              Record payment
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
