"use client";

import { useCallback, useEffect, useState, use } from "react";
import { publicFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { IconChevronRight, IconMinus, IconPlus, IconAlert, IconClock, IconFlame, IconCheckCircle } from "../../../../components/icons";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { PriceDisplay } from "../../../../components/ui/PriceDisplay";
import { StatusBadge } from "../../../../components/ui/StatusBadge";

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
  isAvailable: boolean;
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
};

type OrderItem = {
  id: number;
  quantity: number;
  price: string;
  status: "pending" | "ready" | "served";
  menuItem: { id: number; name: string };
  orderItemModifiers: { id: number; modifier: Modifier }[];
};

type ActiveOrder = {
  id: number;
  status: "pending" | "preparing" | "served" | "billed" | "paid" | "cancelled";
  orderItems: OrderItem[];
};

type TableData = {
  cafe: { name: string; slug: string };
  table: { id: number; tableNumber: string };
  menu: MenuItem[];
  activeOrder: ActiveOrder | null;
};

type CartLine = {
  key: string;
  menuItemId: number;
  name: string;
  quantity: number;
  modifierIds: number[];
  modifierNames: string[];
  unitPrice: number;
};

const ITEM_STATUS_TONE: Record<OrderItem["status"], "neutral" | "warning" | "success"> = {
  pending: "neutral",
  ready: "warning",
  served: "success",
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

export default function PublicOrderPage({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = use(params);
  const { showToast, toastHost } = useToast();

  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedModifierIds, setSelectedModifierIds] = useState<number[]>([]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);

  const refresh = useCallback(() => {
    return publicFetchJson<TableData>(`/public/tables/${qrToken}`)
      .then((res) => {
        setData(res);
        setLoadError("");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "This ordering link isn't working."));
  }, [qrToken]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  function selectItem(item: MenuItem) {
    const outOfStock = item.trackStock && item.stockQuantity <= 0;
    if (outOfStock) return;
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
      current.includes(modifierId) ? current.filter((id) => id !== modifierId) : [...current, modifierId],
    );
  }

  function addToCart(item: MenuItem) {
    const chosenModifiers = item.modifiers.filter((m) => selectedModifierIds.includes(m.id));
    const unitPrice = Number(item.price) + chosenModifiers.reduce((s, m) => s + Number(m.priceDelta), 0);
    setCart((current) => [
      ...current,
      {
        key: `${item.id}-${selectedModifierIds.join(",")}-${Date.now()}`,
        menuItemId: item.id,
        name: item.name,
        quantity,
        modifierIds: selectedModifierIds,
        modifierNames: chosenModifiers.map((m) => m.name),
        unitPrice,
      },
    ]);
    setSelectedItemId(null);
    showToast(`Added ${quantity}× ${item.name} to your order`);
  }

  function removeFromCart(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  async function handleSubmitCart() {
    if (cart.length === 0) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      await publicFetchJson(`/public/tables/${qrToken}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            modifierIds: line.modifierIds,
          })),
        }),
      });
      setCart([]);
      setJustSubmitted(true);
      await refresh();
      showToast("Sent to staff for confirmation");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not send your order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-sm text-center">
          <IconAlert className="mx-auto mb-3 h-8 w-8 text-status-danger-ink" />
          <p className="body-md text-ink-primary">{loadError}</p>
          <p className="body-sm mt-2 text-ink-secondary">Please ask a staff member for help.</p>
        </Card>
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-surface-sunken" />
          ))}
        </div>
      </main>
    );
  }

  const categories = groupByCategory(data.menu);
  const currentCategory = activeCategory ?? categories[0]?.[0];
  const itemsToShow = categories.find(([name]) => name === currentCategory)?.[1] ?? [];
  const cartTotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const placedTotal = data.activeOrder ? data.activeOrder.orderItems.reduce((sum, i) => sum + lineTotal(i), 0) : 0;
  const orderIsFinal = data.activeOrder?.status === "paid" || data.activeOrder?.status === "cancelled";

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-4 pb-40 sm:p-6">
      {toastHost}

      <div className="mb-6">
        <p className="label-sm text-ink-faint">{data.cafe.name}</p>
        <h1 className="display-md text-ink-primary">Table {data.table.tableNumber}</h1>
      </div>

      {justSubmitted && (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-status-success-tint px-4 py-3 text-status-success-ink">
          <IconCheckCircle className="h-5 w-5 shrink-0" />
          <p className="body-sm">Your order was sent. A staff member will confirm it shortly.</p>
        </div>
      )}

      {data.activeOrder && data.activeOrder.orderItems.length > 0 && (
        <Card title="Your order so far" className="mb-6">
          <div className="space-y-3">
            {data.activeOrder.orderItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="body-md font-medium text-ink-primary">
                    {item.quantity}× {item.menuItem.name}
                  </p>
                  {item.orderItemModifiers.length > 0 && (
                    <p className="label-sm text-ink-faint">
                      {item.orderItemModifiers.map((m) => m.modifier.name).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    tone={ITEM_STATUS_TONE[item.status]}
                    icon={item.status === "pending" ? IconClock : item.status === "ready" ? IconFlame : undefined}
                  >
                    {item.status}
                  </StatusBadge>
                  <PriceDisplay amount={lineTotal(item)} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
            <span className="body-md font-semibold text-ink-primary">Total so far</span>
            <PriceDisplay amount={placedTotal} size="lg" />
          </div>
        </Card>
      )}

      {orderIsFinal ? (
        <Card className="text-center">
          <p className="body-md text-ink-secondary">
            This table&rsquo;s order is {data.activeOrder?.status}. Ask staff if you&rsquo;d like to start a new one.
          </p>
        </Card>
      ) : (
        <section>
          <h2 className="heading-lg mb-4 text-ink-primary">Menu</h2>

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

          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
            {itemsToShow.map((item) => {
              const isSelected = selectedItemId === item.id;
              const outOfStock = item.trackStock && item.stockQuantity <= 0;
              const lowStock = item.trackStock && !outOfStock && item.stockQuantity <= item.lowStockThreshold;
              const selectedPrice =
                (Number(item.price) +
                  item.modifiers
                    .filter((m) => selectedModifierIds.includes(m.id))
                    .reduce((s, m) => s + Number(m.priceDelta), 0)) *
                quantity;

              return (
                <Card
                  key={item.id}
                  className={`${isSelected ? "sm:col-span-2" : ""} ${outOfStock ? "opacity-50" : ""}`}
                >
                  <button
                    onClick={() => selectItem(item)}
                    disabled={outOfStock}
                    className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed"
                  >
                    <span className="body-md font-semibold text-ink-primary">{item.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {outOfStock ? (
                        <span className="label-sm font-semibold text-status-danger-ink">Out of stock</span>
                      ) : (
                        <>
                          {lowStock && (
                            <span className="label-sm text-status-warning-ink">{item.stockQuantity} left</span>
                          )}
                          <PriceDisplay amount={item.price} />
                        </>
                      )}
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
                            aria-label="Decrease quantity"
                            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle text-ink-secondary hover:bg-surface-sunken"
                          >
                            <IconMinus className="h-4 w-4" />
                          </button>
                          <span className="body-md w-6 text-center font-semibold text-ink-primary">{quantity}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() =>
                              setQuantity((q) => (item.trackStock ? Math.min(item.stockQuantity, q + 1) : q + 1))
                            }
                            disabled={item.trackStock && quantity >= item.stockQuantity}
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle text-ink-secondary hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <IconPlus className="h-4 w-4" />
                          </button>
                        </div>
                        <Button type="button" onClick={() => addToCart(item)}>
                          Add · <PriceDisplay amount={selectedPrice} />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {cart.length > 0 && !orderIsFinal && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-surface-raised p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 max-h-40 space-y-2 overflow-y-auto">
              {cart.map((line) => (
                <div key={line.key} className="flex items-center justify-between gap-2">
                  <span className="body-sm text-ink-primary">
                    {line.quantity}× {line.name}
                    {line.modifierNames.length > 0 && (
                      <span className="text-ink-faint"> ({line.modifierNames.join(", ")})</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <PriceDisplay amount={line.unitPrice * line.quantity} />
                    <button
                      type="button"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => removeFromCart(line.key)}
                      className="label-sm text-status-danger-ink hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {submitError && <p className="body-sm mb-2 text-status-danger-ink">{submitError}</p>}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="label-sm text-ink-faint">Total</p>
                <PriceDisplay amount={cartTotal} size="lg" />
              </div>
              <Button size="large" onClick={handleSubmitCart} disabled={submitting}>
                {submitting ? "Sending…" : "Send order to staff"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
