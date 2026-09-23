"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetchJson, getCurrentUser } from "../lib/api";
import { useRequireAuth } from "../lib/useRequireAuth";
import { NavBar } from "../components/NavBar";
import { IconInbox } from "../components/icons";
import { Input } from "../components/ui/Input";
import { TableTile } from "../components/ui/TableTile";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Button } from "../components/ui/Button";
import { FilterPills } from "../components/ui/FilterPills";
import { InlineAlert } from "../components/ui/InlineAlert";

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
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  // Read client-side only (mirrors NavBar's own pattern) — getCurrentUser()
  // touches localStorage, which doesn't exist during this client component's
  // server-rendered first pass.
  const [isAdmin, setIsAdmin] = useState(false);

  const loadTables = useCallback(() => {
    return apiFetchJson<Table[]>("/tables")
      .then((res) => {
        setTables(res);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    setIsAdmin(getCurrentUser()?.role === "admin");
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

  // Counts are off the full table list (not the filtered one) so a filter
  // pill's badge always reflects "how many are in that state right now",
  // not "how many are visible after search" — otherwise picking "Occupied"
  // would make every other pill's count disappear along with the rows.
  const statusCounts = useMemo(() => {
    return tables.reduce(
      (acc, table) => {
        acc[table.status] += 1;
        return acc;
      },
      { free: 0, occupied: 0, reserved: 0 } as Record<Table["status"], number>,
    );
  }, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      if (filter !== "All" && table.status !== filter.toLowerCase()) return false;
      if (search && !table.tableNumber.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tables, filter, search]);

  return (
    <main id="main-content" className="min-h-screen">
      <NavBar />
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display-md text-ink-primary">Tables</h1>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <Input pill placeholder="Search tables…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <FilterPills
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            renderLabel={(f) => {
              const count = f === "All" ? tables.length : statusCounts[f.toLowerCase() as Table["status"]];
              return `${f} (${count})`;
            }}
          />
        </div>

        {message && (
          <InlineAlert className="mb-4" onDismiss={() => setMessage("")}>
            {message}
          </InlineAlert>
        )}

        {!ready || loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="rect" className="aspect-square h-auto w-full rounded-xl" />
            ))}
          </div>
        ) : loadError ? (
          <ErrorState
            title="Couldn't load tables"
            description="The tables list didn't come through — check your connection and try again."
            onRetry={() => {
              setLoading(true);
              loadTables().finally(() => setLoading(false));
            }}
          />
        ) : filteredTables.length === 0 ? (
          <EmptyState
            icon={<IconInbox className="h-6 w-6" />}
            title={tables.length === 0 ? "No tables set up yet" : `No ${filter.toLowerCase()} tables`}
            description={
              tables.length === 0
                ? isAdmin
                  ? "Add your first table to start seating guests."
                  : "Ask an admin to set up tables before you can seat guests."
                : "Try a different filter or clear your search."
            }
            action={
              tables.length === 0 ? (
                isAdmin && (
                  <Link href="/admin/tables">
                    <Button variant="secondary">Go to Admin Tables</Button>
                  </Link>
                )
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter("All");
                    setSearch("");
                  }}
                >
                  Clear filter
                </Button>
              )
            }
          />
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
