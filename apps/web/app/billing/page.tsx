"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { NavBar } from "../../components/NavBar";
import { IconCheckCircle } from "../../components/icons";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Button } from "../../components/ui/Button";
import { PriceDisplay } from "../../components/ui/PriceDisplay";
import { EmptyState } from "../../components/ui/EmptyState";
import { DataTable, type Column } from "../../components/ui/DataTable";

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

const COLUMNS: Column[] = [
  { header: "Table", skeletonWidth: "w-20" },
  { header: "Waiter", skeletonWidth: "w-24" },
  { header: "Items", skeletonWidth: "w-14" },
  { header: "Total", skeletonWidth: "w-16" },
  { header: "Status", skeletonWidth: "w-16", skeletonVariant: "badge" },
  { header: "Action", headerClassName: "text-right" },
];

export default function BillingWorklistPage() {
  const ready = useRequireAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const [served, billed] = await Promise.all([
        apiFetchJson<Order[]>("/orders?status=served"),
        apiFetchJson<Order[]>("/orders?status=billed"),
      ]);
      const merged = [...served, ...billed].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setOrders(merged);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadOrders().finally(() => setInitialLoading(false));
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [ready, loadOrders]);

  const isLoading = !ready || initialLoading;

  // Show the standalone "all caught up" empty state only when we know there
  // are genuinely no orders (i.e. not still loading / not an error).
  if (!isLoading && !loadError && orders.length === 0) {
    return (
      <main className="min-h-screen">
        <NavBar />
        <div className="p-4 sm:p-6">
          <h1 className="display-md mb-6 text-ink-primary">Billing</h1>
          <EmptyState
            icon={<IconCheckCircle className="h-6 w-6" />}
            title="All caught up!"
            description="No orders waiting for billing right now. They'll show up here once a waiter marks an order as served."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="p-4 sm:p-6">
        <h1 className="display-md mb-6 text-ink-primary">Billing</h1>

        <Card>
          <DataTable<Order>
            columns={COLUMNS}
            data={orders}
            rowKey={(o) => o.id}
            loading={isLoading}
            error={loadError}
            onRetry={() => {
              setInitialLoading(true);
              loadOrders().finally(() => setInitialLoading(false));
            }}
            errorState={{
              title: "Couldn't load orders",
              description:
                "The billing queue didn't come through — check your connection and try again.",
            }}
            empty={{
              icon: <IconCheckCircle className="h-6 w-6" />,
              title: "All caught up!",
              description:
                "No orders waiting for billing right now. They'll show up here once a waiter marks an order as served.",
            }}
            renderRow={(order) => {
              const isReady = order.status === "billed";
              return (
                <>
                  <td className="py-4 pr-4">
                    <span className="order-code text-ink-primary">
                      {order.table.tableNumber} #{order.id}
                    </span>
                  </td>
                  <td className="body-md py-4 pr-4 text-ink-primary">
                    {order.waiter?.name ?? "—"}
                  </td>
                  <td className="body-md py-4 pr-4 text-ink-secondary">
                    {order.orderItems.length} item
                    {order.orderItems.length === 1 ? "" : "s"}
                  </td>
                  <td className="py-4 pr-4">
                    {order.total ? (
                      <PriceDisplay amount={order.total} />
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="py-4 pr-4">
                    <StatusBadge tone={STATUS_TONE[order.status]}>
                      {order.status}
                    </StatusBadge>
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
                </>
              );
            }}
          />
        </Card>
      </div>
    </main>
  );
}
