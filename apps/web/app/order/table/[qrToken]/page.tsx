"use client";

import { useCallback, useEffect, useState, use } from "react";
import { publicFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { IconClock, IconFlame, IconCheckCircle } from "../../../../components/icons";
import { lineTotal, groupByCategory, type OrderItemData as OrderItem, type MenuItemData } from "../../../../lib/order-utils";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { ErrorState } from "../../../../components/ui/ErrorState";
import { FilterPills } from "../../../../components/ui/FilterPills";
import { InlineAlert } from "../../../../components/ui/InlineAlert";
import { MenuItemCard } from "../../../../components/ui/MenuItemCard";
import { PriceDisplay } from "../../../../components/ui/PriceDisplay";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Skeleton } from "../../../../components/ui/Skeleton";

type MenuItem = MenuItemData & { isAvailable: boolean };

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
        <ErrorState
          title={loadError}
          description="Please ask a staff member for help."
          onRetry={() => {
            setLoadError("");
            setLoading(true);
            refresh().finally(() => setLoading(false));
          }}
        />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main className="min-h-screen p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-40" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rect" className="h-14 w-full rounded-md" />
            ))}
          </div>
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
        <InlineAlert tone="success" icon={<IconCheckCircle className="h-5 w-5 shrink-0" />} className="mb-6" onDismiss={() => setJustSubmitted(false)}>
          Your order was sent. A staff member will confirm it shortly.
        </InlineAlert>
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

          {categories.length > 0 && currentCategory != null && (
            <div className="mb-4">
              <FilterPills
                options={categories.map(([name]) => name)}
                value={currentCategory}
                onChange={setActiveCategory}
              />
            </div>
          )}

          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
            {itemsToShow.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                selected={selectedItemId === item.id}
                quantity={quantity}
                selectedModifierIds={selectedModifierIds}
                onSelect={selectItem}
                onToggleModifier={toggleModifier}
                onQuantityChange={setQuantity}
                onAdd={addToCart}
                size="compact"
              />
            ))}
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
            {submitError && <InlineAlert className="mb-2">{submitError}</InlineAlert>}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="label-sm text-ink-faint">Total</p>
                <PriceDisplay amount={cartTotal} size="lg" />
              </div>
              <Button size="large" onClick={handleSubmitCart} loading={submitting}>
                Send order to staff
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
