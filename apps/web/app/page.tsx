"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getCurrentUser } from "../lib/api";
import { useRequireAuth } from "../lib/useRequireAuth";
import { NavBar } from "../components/NavBar";

type Table = {
  id: number;
  tableNumber: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
  activeOrderId: number | null;
  activeOrderStatus: string | null;
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

  if (!ready || loading) return <main className="p-6">Loading tables...</main>;

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-semibold">Tables</h1>
        {message && <p className="mb-4 text-red-600">{message}</p>}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => handleTableClick(table)}
              className={`rounded-xl p-6 text-left ${
                table.status === "free"
                  ? "bg-green-100 hover:bg-green-200"
                  : "bg-red-100 hover:bg-red-200"
              }`}
            >
              <div className="text-lg font-medium">{table.tableNumber}</div>
              <div className="text-sm text-gray-600">
                Seats {table.capacity}
              </div>
              <div className="mt-2 text-xs font-semibold uppercase">
                {table.status}
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}