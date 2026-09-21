"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getCurrentUser } from "../lib/api";
import { useRequireAuth } from "../lib/useRequireAuth";
import { NavBar } from "../components/NavBar";
import { IconAlert, IconInbox } from "../components/icons";
import { Input } from "../components/ui/Input";
import { TableTile } from "../components/ui/TableTile";
import { StatusBadge } from "../components/ui/StatusBadge";

type Table = {
  id: number;
  tableNumber: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
  activeOrderId: number | null;
  activeOrderStatus: string | null;
};

const ORDER_STAGE_TONE: Record<string, "neutral" | "warning" | "info" | "success"> = {
  pending: "neutral",
  preparing: "warning",
  served: "info",
  billed: "success",
};

const ORDER_STAGE_LABEL: Record<string, string> = {
  pending: "Just opened",
  preparing: "In the kitchen",
  served: "Served",
  billed: "Ready for payment",
};

const FILTERS = ["All", "Free", "Occupied", "Reserved"] as const;
type Filter = (typeof FILTERS)[number];

export default function Home() {
  const router = useRouter();
  const ready = useRequireAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const loadTables = useCallback(() => {
    return apiFetchJson<Table[]>("/tables").then(setTables);
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadTables().finally(() => setLoading(false));
    const interval = setInterval(loadTables, 5000);
    return () => clearInterval(interval);
  }, [ready, loadTables]);

  async function handleTableClick(table: Table) {
    const user = getCurrentUser();
    if (!user) {
      router.push("/login");
      return;
    }

    if (table.status === "free") {
      if (user.role !== "waiter" && user.role !== "admin") {
        setMessage("Only waiters can start a new order.");
        return;
      }

      setMessage("");
      const order = await apiFetchJson<{ id: number }>("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: table.id,
          waiterId: user.id,
          orderType: "dine_in",
        }),
      });
      router.push(`/order/${order.id}`);
      return;
    }

    if (!table.activeOrderId) return;

    // "served" still goes to the Order page, not straight to Billing --
    // the customer may want another round before anyone bills them. Only
    // "billed" (the waiter or cashier explicitly marked it ready) jumps to
    // collecting payment.
    if (table.activeOrderStatus === "billed") {
      router.push(`/billing/${table.activeOrderId}`);
    } else {
      router.push(`/order/${table.activeOrderId}`);
    }
  }

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      if (filter !== "All" && table.status !== filter.toLowerCase()) return false;
      if (search && !table.tableNumber.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tables, filter, search]);

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display-md text-ink-primary">Tables</h1>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <Input pill placeholder="Search tables…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-pill px-4 py-2 font-body text-sm font-semibold transition ${
                  filter === f
                    ? "bg-brand text-on-brand"
                    : "border border-border-subtle bg-surface-raised text-ink-secondary hover:bg-surface-sunken"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <div className="animate-card-in mb-4 flex items-center gap-2 rounded-md bg-status-danger-tint px-4 py-3 body-md text-status-danger-ink">
            <IconAlert className="h-5 w-5 shrink-0" />
            {message}
          </div>
        )}

        {!ready || loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-surface-sunken" />
            ))}
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-raised py-16 text-center">
            <IconInbox className="h-10 w-10 text-ink-faint" />
            <p className="body-md text-ink-secondary">
              {tables.length === 0 ? "No tables configured yet." : "No tables match your search."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filteredTables.map((table) => {
              const stage = table.activeOrderStatus ?? undefined;
              return (
                <div key={table.id} className="flex flex-col gap-2">
                  <TableTile
                    tableNumber={table.tableNumber}
                    seats={table.capacity}
                    status={table.status}
                    onClick={() => handleTableClick(table)}
                  />
                  {stage && ORDER_STAGE_LABEL[stage] && (
                    <StatusBadge tone={ORDER_STAGE_TONE[stage] ?? "neutral"}>{ORDER_STAGE_LABEL[stage]}</StatusBadge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
