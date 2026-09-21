"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { useOrdersSocket } from "../../../lib/useOrdersSocket";
import { NavBar } from "../../../components/NavBar";
import { useToast } from "../../../components/Toast";
import { IconChevronRight, IconMinus, IconPlus, IconAlert } from "../../../components/icons";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PriceDisplay } from "../../../components/ui/PriceDisplay";
import { StatusBadge } from "../../../components/ui/StatusBadge";

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

const STATUS_TONE: Record<Order["status"], "neutral" | "warning" | "info" | "success" | "danger"> = {
  pending: "neutral",
  preparing: "warning",
  served: "info",
  billed: "success",
  paid: "success",
  cancelled: "danger",
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
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

  // This page never polled at all before -- a waiter had no way to know an
  // item was ready short of walking to the kitchen. Kitchen marking an item
  // ready now refreshes this ticket instantly.
  useOrdersSocket(ready, {
    onItemReady: (payload) => {
      if (payload.orderId === Number(id)) refreshOrder();
    },
  });

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
              <div key={i} className="h-14 animate-pulse rounded-md bg-surface-sunken" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-lg bg-surface-sunken" />
        </div>
      </main>
    );
  }

  const runningTotal = order.orderItems.reduce((sum, item) => sum + lineTotal(item), 0);
  const categories = groupByCategory(menu);
  const currentCategory = activeCategory ?? categories[0]?.[0];
  const itemsToShow = categories.find(([name]) => name === currentCategory)?.[1] ?? [];
  const isFinal = order.status === "cancelled" || order.status === "paid";

  return (
    <main className="min-h-screen">
      <NavBar />
      {toastHost}
      <div className={isFinal ? "p-4 sm:p-6" : "grid gap-6 p-4 sm:grid-cols-2 sm:p-6"}>
        {!isFinal && (
          <section>
            <h2 className="heading-lg mb-4 text-ink-primary">Menu</h2>

            {menuLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-md bg-surface-sunken" />
                ))}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {categories.map(([categoryName]) => (
                    <button
                      key={categoryName}
                      type="button"
                      onClick={() => setActiveCategory(categoryName)}
                      className={`rounded-pill px-4 py-2 font-body text-sm font-semibold transition ${
                        currentCategory === categoryName
                          ? "bg-brand text-on-brand"
                          : "border border-border-subtle bg-surface-raised text-ink-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {categoryName}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 items-start gap-3">
                  {itemsToShow.map((item) => {
                    const isSelected = selectedItemId === item.id;
                    const selectedPrice =
                      (Number(item.price) +
                        item.modifiers
                          .filter((m) => selectedModifierIds.includes(m.id))
                          .reduce((s, m) => s + Number(m.priceDelta), 0)) *
                      quantity;

                    return (
                      <Card key={item.id} className={isSelected ? "col-span-2" : undefined}>
                        <button
                          onClick={() => selectItem(item)}
                          className="flex w-full items-center justify-between gap-2 text-left"
                        >
                          <span className="body-md font-semibold text-ink-primary">{item.name}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <PriceDisplay amount={item.price} />
                            <IconChevronRight
                              className={`h-4 w-4 text-ink-faint transition-transform ${isSelected ? "rotate-90" : ""}`}
                            />
                          </span>
                        </button>

                        {isSelected && (
                          <div className="animate-card-in mt-4 flex flex-col gap-4 border-t border-border-subtle pt-4">
                            {item.modifiers.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {item.modifiers.map((modifier) => {
                                  const active = selectedModifierIds.includes(modifier.id);
                                  return (
                                    <button
                                      key={modifier.id}
                                      type="button"
                                      onClick={() => toggleModifier(modifier.id)}
                                      className={`rounded-pill border-2 px-3 py-1.5 body-sm font-semibold transition ${
                                        active
                                          ? "border-brand bg-brand-tint text-brand-strong"
                                          : "border-border-subtle bg-surface-raised text-ink-secondary hover:border-border-strong"
                                      }`}
                                    >
                                      {modifier.name} +Rs. {modifier.priceDelta}
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
                                  className="flex h-10 w-10 items-center justify-center rounded-pill border border-border-strong bg-surface-raised text-ink-secondary active:scale-95"
                                  aria-label="Decrease quantity"
                                >
                                  <IconMinus />
                                </button>
                                <span className="heading-sm w-6 text-center text-ink-primary">{quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => setQuantity((q) => q + 1)}
                                  className="flex h-10 w-10 items-center justify-center rounded-pill border border-border-strong bg-surface-raised text-ink-secondary active:scale-95"
                                  aria-label="Increase quantity"
                                >
                                  <IconPlus />
                                </button>
                              </div>
                              <Button onClick={() => handleAddItem(item)} disabled={adding}>
                                Add · <PriceDisplay amount={selectedPrice} />
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        <section className={isFinal ? "mx-auto w-full max-w-md" : undefined}>
          <Card className="sticky top-20">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="heading-lg text-ink-primary">Order #{order.id}</h2>
                <div className="mt-1">
                  <StatusBadge tone={STATUS_TONE[order.status]}>{order.status}</StatusBadge>
                </div>
              </div>
            </div>

            <div className="mb-4 space-y-2">
              {order.orderItems.length === 0 && (
                <p className="body-md rounded-md bg-surface-sunken p-4 text-center text-ink-faint">
                  No items yet — tap the menu to add some.
                </p>
              )}
              {order.orderItems.map((item) => (
                <div key={item.id} className="rounded-md bg-surface-sunken p-3">
                  <div className="flex items-center justify-between">
                    <span className="body-md font-medium text-ink-primary">
                      {item.quantity}× {item.menuItem.name}
                    </span>
                    <PriceDisplay amount={lineTotal(item)} />
                  </div>
                  {item.orderItemModifiers.length > 0 && (
                    <div className="body-sm mt-1 text-ink-secondary">
                      {item.orderItemModifiers.map((oim) => oim.modifier.name).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {order.orderItems.length > 0 && (
              <div className="mb-4 flex items-center justify-between border-t border-border-subtle pt-3">
                <span className="label-md text-ink-secondary">Running total</span>
                <PriceDisplay amount={runningTotal} size="lg" />
              </div>
            )}

            {order.status === "cancelled" || order.status === "paid" ? (
              <p className="body-md rounded-md bg-surface-sunken p-4 text-center font-medium text-ink-secondary">
                {order.status === "paid"
                  ? "This order has been paid. Nothing more to do here."
                  : "This order was cancelled."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleSendToKitchen}
                  disabled={order.status !== "pending"}
                  variant="primary"
                  size="large"
                  className="w-full"
                >
                  Send to kitchen
                </Button>
                <Button onClick={handleServe} disabled={order.status !== "preparing"} variant="secondary" className="w-full">
                  Serve
                </Button>

                {order.status === "pending" &&
                  (confirmingCancel ? (
                    <div className="animate-card-in rounded-md bg-status-danger-tint p-3">
                      <p className="body-md mb-3 font-medium text-status-danger-ink">
                        Cancel this order? This can&apos;t be undone.
                      </p>
                      <div className="flex gap-2">
                        <Button onClick={handleCancel} variant="danger" className="flex-1">
                          Yes, cancel
                        </Button>
                        <Button onClick={() => setConfirmingCancel(false)} variant="secondary" className="flex-1">
                          Keep order
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setConfirmingCancel(true)}
                      variant="secondary"
                      className="mt-2 w-full text-status-danger-ink"
                    >
                      Cancel order
                    </Button>
                  ))}
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-status-danger-tint px-3 py-2 body-md text-status-danger-ink">
                <IconAlert className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}
