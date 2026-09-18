"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { NavBar } from "../../../components/NavBar";

type Modifier = {
  id: number;
  name: string;
  priceDelta: string;
};

type MenuItem = {
  id: number;
  name: string;
  price: string;
  category: { id: number; name: string };
  modifiers: Modifier[];
};

type OrderItem = {
  id: number;
  quantity: number;
  price: string;
  status: "pending" | "ready" | "served";
  menuItem: { id: number; name: string };
  orderItemModifiers: { id: number; modifier: Modifier }[];
};

type Order = {
  id: number;
  status: "pending" | "preparing" | "served" | "billed" | "paid" | "cancelled";
  orderItems: OrderItem[];
};

function lineTotal(item: OrderItem): number {
  const modifierTotal = item.orderItemModifiers.reduce(
    (sum, oim) => sum + Number(oim.modifier.priceDelta),
    0,
  );
  return (Number(item.price) + modifierTotal) * item.quantity;
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const ready = useRequireAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedModifierIds, setSelectedModifierIds] = useState<number[]>([]);
  const [error, setError] = useState("");

  const refreshOrder = useCallback(() => {
    return apiFetchJson<Order>(`/orders/${id}`).then(setOrder);
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    refreshOrder();
    apiFetchJson<MenuItem[]>("/menu").then(setMenu);
  }, [ready, refreshOrder]);

  function selectItem(item: MenuItem) {
    if (selectedItemId === item.id) {
      setSelectedItemId(null);
      return;
    }
    setSelectedItemId(item.id);
    setQuantity(1);
    setSelectedModifierIds([]);
  }

  function toggleModifier(modifierId: number) {
    setSelectedModifierIds((current) =>
      current.includes(modifierId)
        ? current.filter((id) => id !== modifierId)
        : [...current, modifierId],
    );
  }

  async function handleAddItem(menuItemId: number) {
    setError("");
    try {
      await apiFetchJson(`/orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId,
          quantity,
          modifierIds: selectedModifierIds,
        }),
      });
      setSelectedItemId(null);
      await refreshOrder();
    } catch {
      setError("Could not add that item.");
    }
  }

  async function handleSendToKitchen() {
    setError("");
    try {
      await apiFetchJson(`/orders/${id}/send-to-kitchen`, { method: "PATCH" });
      await refreshOrder();
    } catch {
      setError("Could not send the order to the kitchen.");
    }
  }

  async function handleServe() {
    setError("");
    try {
      await apiFetchJson(`/orders/${id}/serve`, { method: "PATCH" });
      await refreshOrder();
    } catch {
      setError("Could not mark the order as served.");
    }
  }

  async function handleCancel() {
    setError("");
    try {
      await apiFetchJson(`/orders/${id}/cancel`, { method: "PATCH" });
      router.push("/");
    } catch {
      setError("Could not cancel the order.");
    }
  }

  if (!ready || !order) return <main className="p-6">Loading order...</main>;

  return (
    <main className="min-h-screen">
      <NavBar />
      <div className="grid gap-6 p-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-4 text-xl font-semibold">Menu</h2>
          <div className="grid gap-2">
            {menu.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-300">
                <button
                  onClick={() => selectItem(item)}
                  className="w-full p-3 text-left hover:bg-gray-50"
                >
                  {item.name} — रु {item.price}
                </button>

                {selectedItemId === item.id && (
                  <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 p-3">
                    {item.modifiers.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {item.modifiers.map((modifier) => (
                          <label key={modifier.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedModifierIds.includes(modifier.id)}
                              onChange={() => toggleModifier(modifier.id)}
                            />
                            {modifier.name} (+रु {modifier.priceDelta})
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-600">
                        Qty
                        <input
                          type="number"
                          min={1}
                          value={quantity}
                          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                          className="ml-2 w-16 rounded border border-gray-300 p-1"
                        />
                      </label>
                      <button
                        onClick={() => handleAddItem(item.id)}
                        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Order #{order.id} — {order.status}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleSendToKitchen}
                disabled={order.status !== "pending"}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Send to kitchen
              </button>
              <button
                onClick={handleServe}
                disabled={order.status !== "preparing"}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Serve
              </button>
              {order.status === "pending" && (
                <button
                  onClick={handleCancel}
                  className="rounded-lg border border-red-600 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Cancel order
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            {order.orderItems.map((item) => (
              <div key={item.id} className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <span>
                    {item.quantity}x {item.menuItem.name}
                  </span>
                  <span>रु {lineTotal(item).toFixed(2)}</span>
                </div>
                {item.orderItemModifiers.length > 0 && (
                  <div className="text-xs text-gray-500">
                    {item.orderItemModifiers.map((oim) => oim.modifier.name).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && <p className="mt-4 text-red-600">{error}</p>}
        </section>
      </div>
    </main>
  );
}
