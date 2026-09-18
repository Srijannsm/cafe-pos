"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { NavBar } from "../../../components/NavBar";
import { useToast } from "../../../components/Toast";
import { IconChevronRight, IconMinus, IconPlus, IconAlert } from "../../../components/icons";

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

const STATUS_BADGE: Record<Order["status"], string> = {
  pending: "bg-stone-200 text-stone-700",
  preparing: "bg-warning-subtle text-warning-subtle-fg",
  served: "bg-info-subtle text-info-subtle-fg",
  billed: "bg-plum-subtle text-plum-subtle-fg",
  paid: "bg-success-subtle text-success-subtle-fg",
  cancelled: "bg-stone-200 text-stone-500",
};

function lineTotal(item: OrderItem): number {
  const modifierTotal = item.orderItemModifiers.reduce(
    (sum, oim) => sum + Number(oim.modifier.priceDelta),
    0,
  );
  return (Number(item.price) + modifierTotal) * item.quantity;
}

function groupByCategory(menu: MenuItem[]): [string, MenuItem[]][] {
  const groups = new Map<string, MenuItem[]>();
  for (const item of menu) {
    const key = item.category.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.entries());
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const ready = useRequireAuth();
  const { showToast, toastHost } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedModifierIds, setSelectedModifierIds] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const refreshOrder = useCallback(() => {
    return apiFetchJson<Order>(`/orders/${id}`).then(setOrder);
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    refreshOrder();
    apiFetchJson<MenuItem[]>("/menu")
      .then(setMenu)
      .finally(() => setMenuLoading(false));
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

  async function handleAddItem(item: MenuItem) {
    setError("");
    setAdding(true);
    try {
      await apiFetchJson(`/orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: item.id,
          quantity,
          modifierIds: selectedModifierIds,
        }),
      });
      setSelectedItemId(null);
      await refreshOrder();
      showToast(`Added ${quantity}× ${item.name}`);
    } catch {
      setError("Could not add that item.");
    } finally {
      setAdding(false);
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
      setConfirmingCancel(false);
    }
  }

  if (!ready || !order) {
    return (
      <main className="min-h-screen">
        <NavBar />
        <div className="grid gap-6 p-4 sm:grid-cols-2 sm:p-6">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-stone-200" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-stone-200" />
        </div>
      </main>
    );
  }

  const runningTotal = order.orderItems.reduce((sum, item) => sum + lineTotal(item), 0);
  const categories = groupByCategory(menu);
  const isFinal = order.status === "cancelled" || order.status === "paid";

  return (
    <main className="min-h-screen">
      <NavBar />
      {toastHost}
      <div className={isFinal ? "p-4 sm:p-6" : "grid gap-6 p-4 sm:grid-cols-2 sm:p-6"}>
        {!isFinal && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-stone-900">Menu</h2>

          {menuLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-stone-200" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {categories.map(([categoryName, items]) => (
                <div key={categoryName}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">{categoryName}</h3>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="card overflow-hidden">
                        <button
                          onClick={() => selectItem(item)}
                          className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-stone-50 active:bg-stone-100"
                        >
                          <span className="font-medium text-stone-900">{item.name}</span>
                          <span className="flex items-center gap-2 text-sm text-stone-500">
                            रु {item.price}
                            <IconChevronRight
                              className={`h-4 w-4 text-stone-300 transition-transform ${
                                selectedItemId === item.id ? "rotate-90" : ""
                              }`}
                            />
                          </span>
                        </button>

                        {selectedItemId === item.id && (
                          <div className="animate-card-in flex flex-col gap-4 border-t border-stone-200 bg-stone-50 p-4">
                            {item.modifiers.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {item.modifiers.map((modifier) => {
                                  const active = selectedModifierIds.includes(modifier.id);
                                  return (
                                    <button
                                      key={modifier.id}
                                      type="button"
                                      onClick={() => toggleModifier(modifier.id)}
                                      className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition ${
                                        active
                                          ? "border-primary bg-primary-subtle text-primary-subtle-fg"
                                          : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                                      }`}
                                    >
                                      {modifier.name} +रु {modifier.priceDelta}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                                  className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 active:scale-95"
                                  aria-label="Decrease quantity"
                                >
                                  <IconMinus />
                                </button>
                                <span className="w-6 text-center text-base font-bold text-stone-900">{quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => setQuantity((q) => q + 1)}
                                  className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 active:scale-95"
                                  aria-label="Increase quantity"
                                >
                                  <IconPlus />
                                </button>
                              </div>
                              <button onClick={() => handleAddItem(item)} disabled={adding} className="btn btn-primary">
                                Add · रु{" "}
                                {(
                                  (Number(item.price) +
                                    item.modifiers
                                      .filter((m) => selectedModifierIds.includes(m.id))
                                      .reduce((s, m) => s + Number(m.priceDelta), 0)) *
                                  quantity
                                ).toFixed(2)}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        <section className={isFinal ? "mx-auto w-full max-w-md" : undefined}>
          <div className="card sticky top-20 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Order #{order.id}</h2>
                <span className={`badge mt-1 ${STATUS_BADGE[order.status]}`}>{order.status}</span>
              </div>
            </div>

            <div className="mb-4 space-y-2">
              {order.orderItems.length === 0 && (
                <p className="rounded-xl bg-stone-50 p-4 text-center text-sm text-stone-400">
                  No items yet — tap the menu to add some.
                </p>
              )}
              {order.orderItems.map((item) => (
                <div key={item.id} className="rounded-xl bg-stone-50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-stone-800">
                      {item.quantity}× {item.menuItem.name}
                    </span>
                    <span className="tabular-nums font-semibold text-stone-900">
                      रु {lineTotal(item).toFixed(2)}
                    </span>
                  </div>
                  {item.orderItemModifiers.length > 0 && (
                    <div className="mt-1 text-xs text-stone-500">
                      {item.orderItemModifiers.map((oim) => oim.modifier.name).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {order.orderItems.length > 0 && (
              <div className="mb-4 flex items-center justify-between border-t border-stone-200 pt-3">
                <span className="text-sm font-semibold text-stone-500">Running total</span>
                <span className="text-lg font-bold text-stone-900">रु {runningTotal.toFixed(2)}</span>
              </div>
            )}

            {order.status === "cancelled" || order.status === "paid" ? (
              <p className="rounded-xl bg-stone-50 p-4 text-center text-sm font-medium text-stone-500">
                {order.status === "paid" ? "This order has been paid. Nothing more to do here." : "This order was cancelled."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSendToKitchen}
                  disabled={order.status !== "pending"}
                  className="btn btn-primary w-full"
                >
                  Send to kitchen
                </button>
                <button onClick={handleServe} disabled={order.status !== "preparing"} className="btn btn-secondary w-full">
                  Serve
                </button>

                {order.status === "pending" &&
                  (confirmingCancel ? (
                    <div className="animate-card-in rounded-xl border border-danger-subtle bg-danger-subtle p-3">
                      <p className="mb-3 text-sm font-medium text-danger-subtle-fg">
                        Cancel this order? This can&apos;t be undone.
                      </p>
                      <div className="flex gap-2">
                        <button onClick={handleCancel} className="btn btn-danger flex-1">
                          Yes, cancel
                        </button>
                        <button onClick={() => setConfirmingCancel(false)} className="btn btn-secondary flex-1">
                          Keep order
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmingCancel(true)} className="btn btn-danger-outline mt-2 w-full">
                      Cancel order
                    </button>
                  ))}
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-danger-subtle px-3 py-2 text-sm font-medium text-danger-subtle-fg">
                <IconAlert className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
