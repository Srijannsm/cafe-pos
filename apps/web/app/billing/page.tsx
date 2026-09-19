"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { NavBar } from "../../components/NavBar";
import { IconInbox } from "../../components/icons";

type Order = {
  id: number;
  status: "served" | "billed";
  createdAt: string;
  table: { tableNumber: string };
  orderItems: { id: number }[];
};

const STATUS_BADGE: Record<Order["status"], string> = {
  served: "bg-info-subtle text-info-subtle-fg",
  billed: "bg-plum-subtle text-plum-subtle-fg",
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
        <h1 className="mb-6 text-2xl font-bold text-stone-900">Billing</h1>

        {!ready || initialLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-stone-200" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white py-20 text-center">
            <IconInbox className="h-12 w-12 text-stone-300" />
            <p className="text-lg text-stone-500">No orders waiting for billing right now.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/billing/${order.id}`}
                className="animate-card-in card flex flex-col gap-3 p-4 transition hover:border-primary hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold text-stone-900">
                    {order.table.tableNumber} <span className="text-stone-400">#{order.id}</span>
                  </div>
                  <span className={`badge ${STATUS_BADGE[order.status]}`}>{order.status}</span>
                </div>
                <div className="text-sm text-stone-500">
                  {order.orderItems.length} item{order.orderItems.length === 1 ? "" : "s"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
