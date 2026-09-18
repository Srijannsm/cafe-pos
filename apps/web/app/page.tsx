"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getCurrentUser } from "../lib/api";
import { useRequireAuth } from "../lib/useRequireAuth";
import { NavBar } from "../components/NavBar";
import { IconAlert, IconInbox } from "../components/icons";

type Table = {
  id: number;
  tableNumber: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
  activeOrderId: number | null;
  activeOrderStatus: string | null;
};

const ORDER_STAGE_BADGE: Record<string, string> = {
  pending: "bg-stone-200 text-stone-700",
  preparing: "bg-warning-subtle text-warning-subtle-fg",
  served: "bg-info-subtle text-info-subtle-fg",
  billed: "bg-plum-subtle text-plum-subtle-fg",
};

const ORDER_STAGE_LABEL: Record<string, string> = {
  pending: "Just opened",
  preparing: "In the kitchen",
  served: "Served",
  billed: "Ready for payment",
};

export default function Home() {
  const router = useRouter();
  const ready = useRequireAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ready) return;

    apiFetchJson<Table[]>("/tables")
      .then(setTables)
      .finally(() => setLoading(false));
  }, [ready]);

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

    if (table.activeOrderStatus === "served" || table.activeOrderStatus === "billed") {
      router.push(`/billing/${table.activeOrderId}`);
    } else {
      router.push(`/order/${table.activeOrderId}`);
    }
  }

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-900">Tables</h1>
          <div className="flex items-center gap-4 text-xs font-semibold text-stone-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-success" /> Free
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Occupied
            </span>
          </div>
        </div>

        {message && (
          <div className="animate-card-in mb-4 flex items-center gap-2 rounded-xl bg-danger-subtle px-4 py-3 text-sm font-medium text-danger-subtle-fg">
            <IconAlert className="h-5 w-5 shrink-0" />
            {message}
          </div>
        )}

        {!ready || loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-stone-200" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center">
            <IconInbox className="h-10 w-10 text-stone-300" />
            <p className="text-stone-500">No tables configured yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((table) => {
              const isFree = table.status === "free";
              const stage = table.activeOrderStatus ?? undefined;

              return (
                <button
                  key={table.id}
                  onClick={() => handleTableClick(table)}
                  className={`flex min-h-36 flex-col justify-between rounded-2xl border-2 p-4 text-left shadow-sm transition active:scale-[0.98] ${
                    isFree
                      ? "border-emerald-200 bg-success-subtle hover:border-emerald-300"
                      : table.status === "occupied"
                        ? "border-orange-200 bg-primary-subtle hover:border-orange-300"
                        : "border-stone-200 bg-stone-100"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-xl font-bold text-stone-900">{table.tableNumber}</div>
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full ${
                        isFree ? "bg-success" : table.status === "occupied" ? "bg-primary" : "bg-stone-400"
                      }`}
                    />
                  </div>
                  <div className="text-xs text-stone-500">Seats {table.capacity}</div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`badge ${
                        isFree
                          ? "bg-success-subtle text-success-subtle-fg"
                          : table.status === "occupied"
                            ? "bg-primary-subtle text-primary-subtle-fg"
                            : "bg-stone-200 text-stone-600"
                      }`}
                    >
                      {table.status}
                    </span>
                    {stage && ORDER_STAGE_BADGE[stage] && (
                      <span className={`badge normal-case ${ORDER_STAGE_BADGE[stage]}`}>
                        {ORDER_STAGE_LABEL[stage]}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
