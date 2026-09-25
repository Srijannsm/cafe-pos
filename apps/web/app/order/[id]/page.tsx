"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiFetchJson } from "../../../lib/api";
import { useRequireAuth } from "../../../lib/useRequireAuth";
import { useOrdersSocket } from "../../../lib/useOrdersSocket";
import { NavBar } from "../../../components/NavBar";
import { useToast } from "../../../components/Toast";
import { lineTotal, groupByCategory, type OrderItemData as OrderItem, type MenuItemData as MenuItem } from "../../../lib/order-utils";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { FilterPills } from "../../../components/ui/FilterPills";
import { InlineAlert } from "../../../components/ui/InlineAlert";
import { MenuItemCard } from "../../../components/ui/MenuItemCard";
import { PriceDisplay } from "../../../components/ui/PriceDisplay";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorState } from "../../../components/ui/ErrorState";
import { IconX, IconCheck, IconSearch } from "../../../components/icons";

type Order = {
  id: number;
  status: "pending" | "preparing" | "served" | "billed" | "paid" | "cancelled";
  orderItems: OrderItem[];
  notes: string | null;
  table: { tableNumber: string };
};

const STATUS_TONE: Record<Order["status"], "neutral" | "warning" | "info" | "success" | "danger"> = {
  pending: "neutral",
  preparing: "warning",
  served: "info",
  billed: "success",
  paid: "success",
  cancelled: "danger",
};

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const ready = useRequireAuth();
  const { showToast, toastHost } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedModifierIds, setSelectedModifierIds] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingKitchen, setConfirmingKitchen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [mobileTab, setMobileTab] = useState<"menu" | "cart">("menu");
  const [recentlyAddedId, setRecentlyAddedId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const refreshOrder = useCallback(() => {
    return apiFetchJson<Order>(`/orders/${id}`).then((o) => {
      setOrder(o);
      return o;
    });
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    refreshOrder()
      .then((o) => { if (o) setNotes(o.notes ?? ""); })
      .catch(() => setLoadError(true));
    apiFetchJson<MenuItem[]>("/menu")
      .then(setMenu)
      .finally(() => setMenuLoading(false));
  }, [ready, refreshOrder]);

  useOrdersSocket(ready, {
    onItemReady: (payload) => {
      if (payload.orderId === Number(id)) refreshOrder();
    },
  });

  function selectItem(item: MenuItem) {
    if (item.trackStock && item.stockQuantity <= 0) return;
    if (selectedItemId === item.id) { setSelectedItemId(null); return; }
    setSelectedItemId(item.id);
    setQuantity(1);
    setSelectedModifierIds([]);
  }

  function toggleModifier(modifierId: number) {
    setSelectedModifierIds((current) =>
      current.includes(modifierId) ? current.filter((mid) => mid !== modifierId) : [...current, modifierId],
    );
  }

  async function handleAddItem(item: MenuItem) {
    setError("");
    setAdding(true);
    try {
      await apiFetchJson(`/orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuItemId: item.id, quantity, modifierIds: selectedModifierIds }),
      });
      setSelectedItemId(null);
      const updated = await refreshOrder();

      showToast(`Added ${quantity}× ${item.name}`);
      setMobileTab("cart");
      setRecentlyAddedId(item.id);
      setTimeout(() => setRecentlyAddedId(null), 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that item.");
    } finally {
      setAdding(false);
    }
  }

  async function handleQuickAdd(item: MenuItem) {
    try {
      await apiFetchJson(`/orders/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuItemId: item.id, quantity: 1, modifierIds: [] }),
      });
      await refreshOrder();
      showToast(`Added 1× ${item.name}`);
      setMobileTab("cart");
      setRecentlyAddedId(item.id);
      setTimeout(() => setRecentlyAddedId(null), 400);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not add that item.", "error");
    }
  }

  async function handleRemoveItem(orderItemId: number, name: string) {
    setRemovingItemId(orderItemId);
    try {
      await apiFetch(`/orders/items/${orderItemId}`, { method: "DELETE" });
      await refreshOrder();
      showToast(`Removed ${name}`);
    } catch {
      setError("Could not remove that item.");
    } finally {
      setRemovingItemId(null);
    }
  }

  async function handleSendToKitchen() {
    setError("");
    setConfirmingKitchen(false);
    try {
      await apiFetchJson(`/orders/${id}/send-to-kitchen`, { method: "PATCH" });
      await refreshOrder();
      showToast("Order sent to kitchen!");
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

  async function handleReadyToBill() {
    setError("");
    try {
      await apiFetchJson(`/orders/${id}/bill`, { method: "PATCH" });
      await refreshOrder();
    } catch {
      setError("Could not mark the order ready to bill.");
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

  async function handleSaveNotes() {
    if (!order) return;
    setNotesSaving(true);
    try {
      await apiFetchJson(`/orders/${id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch {
      // silently ignore
    } finally {
      setNotesSaving(false);
    }
  }

  // Menu filtering
  const categories = useMemo(() => groupByCategory(menu), [menu]);
  const searchedItems = useMemo(() => {
    if (!menuSearch.trim()) return null;
    const q = menuSearch.toLowerCase();
    return menu.filter((item) => item.name.toLowerCase().includes(q));
  }, [menu, menuSearch]);

  const currentCategory = activeCategory ?? categories[0]?.[0];
  const itemsToShow = searchedItems !== null
    ? searchedItems
    : (categories.find(([name]) => name === currentCategory)?.[1] ?? []);

  if (!ready || !order) {
    return (
      <main id="main-content" className="min-h-screen">
        <NavBar />
        <div className="p-4 sm:p-6">
          {loadError ? (
            <ErrorState
              title="Couldn't load this order"
              description="The order didn't come through — check your connection and try again."
              onRetry={() => { setLoadError(false); refreshOrder().catch(() => setLoadError(true)); }}
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} variant="rect" className="h-14 w-full rounded-md" />
                ))}
              </div>
              <Skeleton variant="rect" className="h-64 w-full rounded-lg" />
            </div>
          )}
        </div>
      </main>
    );
  }

  const runningTotal = order.orderItems.reduce((sum, item) => sum + lineTotal(item), 0);
  const allItemsReady =
    order.orderItems.length > 0 && order.orderItems.every((item) => item.status !== "pending");
  const isFinal = order.status === "cancelled" || order.status === "paid";

  // --- item groupings used in both the cart section and action buttons ---
  // Items kitchen has finished (ready or served)
  const sentItems = order.orderItems.filter((i) => i.status === "ready" || i.status === "served");
  // Items in kitchen (order is preparing, item still pending AND was already sent)
  const inKitchenItems = order.status === "preparing"
    ? order.orderItems.filter((i) => i.status === "pending" && i.sentToKitchen)
    : [];
  // Items added after order was sent (need another send to kitchen)
  const newUnsentItems = order.status === "preparing"
    ? order.orderItems.filter((i) => i.status === "pending" && !i.sentToKitchen)
    : [];
  // Items in an unsent order (nothing sent yet)
  const pendingFirstItems = order.status === "pending"
    ? order.orderItems.filter((i) => i.status === "pending")
    : [];

  return (
    <main id="main-content" className="min-h-screen">
      <NavBar />
      {toastHost}
      {/* Mobile tab toggle */}
      {!isFinal && (
        <div className="flex border-b border-border-subtle sm:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("menu")}
            className={`flex-1 py-3 label-md font-semibold transition-colors ${mobileTab === "menu" ? "border-b-2 border-brand text-brand-strong" : "text-ink-secondary"}`}
          >
            Menu
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("cart")}
            className={`flex-1 py-3 label-md font-semibold transition-colors ${mobileTab === "cart" ? "border-b-2 border-brand text-brand-strong" : "text-ink-secondary"}`}
          >
            Cart{order.orderItems.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white text-xs">
                {order.orderItems.length}
              </span>
            )}
          </button>
        </div>
      )}

      <div className={isFinal ? "p-4 sm:p-6" : "grid gap-6 p-4 sm:grid-cols-2 sm:p-6"}>
        {!isFinal && (
          <section className={mobileTab === "cart" ? "hidden sm:block" : ""}>
            <h2 className="heading-lg mb-3 text-ink-primary">Menu</h2>

            {menuLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} variant="rect" className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <>
                {/* Search bar */}
                <div className="relative mb-3">
                  <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Search menu…"
                    value={menuSearch}
                    onChange={(e) => { setMenuSearch(e.target.value); setSelectedItemId(null); }}
                    className="w-full rounded-xl border border-border-subtle bg-surface-raised pl-9 pr-4 py-2.5 body-md text-ink-primary placeholder:text-ink-faint outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  {menuSearch && (
                    <button
                      type="button"
                      onClick={() => setMenuSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-secondary"
                    >
                      <IconX className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Category pills — hidden during search */}
                {!menuSearch && categories.length > 0 && currentCategory != null && (
                  <div className="mb-3">
                    <FilterPills
                      options={categories.map(([name]) => name)}
                      value={currentCategory}
                      onChange={(cat) => { setActiveCategory(cat); setSelectedItemId(null); }}
                    />
                  </div>
                )}

                {menuSearch && (
                  <p className="mb-2 label-sm text-ink-faint">
                    {itemsToShow.length === 0
                      ? `No items match "${menuSearch}"`
                      : `${itemsToShow.length} result${itemsToShow.length === 1 ? "" : "s"}`}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 items-start gap-3">
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
                      onAdd={handleAddItem}
                      addLoading={adding && selectedItemId === item.id}
                      onQuickAdd={handleQuickAdd}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <section className={`${isFinal ? "mx-auto w-full max-w-md" : ""} ${!isFinal && mobileTab === "menu" ? "hidden sm:block" : ""}`}>
          <Card className="sticky top-20">
            <div className="mb-4">
              <h2 className="heading-lg text-ink-primary">
                Table {order.table.tableNumber} · #{order.id}
              </h2>
              <div className="mt-1">
                <StatusBadge tone={order.status === "preparing" && allItemsReady ? "success" : STATUS_TONE[order.status]}>
                  {order.status === "preparing" && allItemsReady ? "ready to serve" : order.status}
                </StatusBadge>
              </div>
            </div>

            {(() => {
              const canRemove = order.status === "pending" || order.status === "preparing";
              const showSections = order.status === "preparing";
              // Use component-scope groupings: sentItems, inKitchenItems, newUnsentItems, pendingFirstItems

              const renderItem = (item: OrderItem, removable: boolean, variant: "normal" | "in-kitchen" | "done") => (
                <div
                  key={item.id}
                  className={[
                    "rounded-xl p-3 transition-colors",
                    variant === "done" ? "bg-status-success-tint" : "bg-surface-sunken",
                    recentlyAddedId === item.menuItem.id ? "animate-slide-in-right" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {variant === "done" && (
                          <IconCheck className="h-4 w-4 shrink-0 text-status-success-ink" />
                        )}
                        {variant === "in-kitchen" && (
                          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-status-warning" />
                        )}
                        <span className="body-md font-medium text-ink-primary">
                          {item.quantity}× {item.menuItem.name}
                        </span>
                      </div>
                      {item.orderItemModifiers.length > 0 && (
                        <div className="body-sm mt-1 text-ink-secondary">
                          {item.orderItemModifiers.map((oim) => oim.modifier.name).join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <PriceDisplay amount={lineTotal(item)} />
                      {removable && (
                        <button
                          type="button"
                          aria-label={`Remove ${item.menuItem.name}`}
                          disabled={removingItemId === item.id}
                          onClick={() => handleRemoveItem(item.id, item.menuItem.name)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-ink-faint transition hover:bg-surface-raised hover:text-status-danger-ink disabled:opacity-40"
                        >
                          {removingItemId === item.id ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <IconX className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );

              const SectionHeader = ({ label, count, accent }: { label: string; count: number; accent?: boolean }) => (
                <div className={`flex items-center gap-2 pt-1 pb-0.5 ${accent ? "text-status-warning-ink" : "text-ink-faint"}`}>
                  <span className="label-sm font-semibold uppercase tracking-wide">{label}</span>
                  <div className={`h-px flex-1 ${accent ? "bg-status-warning/30" : "bg-border-subtle"}`} />
                  <span className="label-sm">{count} item{count !== 1 ? "s" : ""}</span>
                </div>
              );

              return (
                <div className="mb-4 space-y-1.5">
                  {order.orderItems.length === 0 && (
                    <p className="body-md rounded-xl bg-surface-sunken p-4 text-center text-ink-faint">
                      No items yet — tap the menu to add some.
                    </p>
                  )}

                  {/* Order not yet sent — plain list */}
                  {pendingFirstItems.map((item) => renderItem(item, canRemove, "normal"))}

                  {/* Order sent to kitchen — show sections */}
                  {showSections && (
                    <>
                      {inKitchenItems.length > 0 && (
                        <div className="space-y-1.5">
                          <SectionHeader label="🔥 In kitchen" count={inKitchenItems.length} accent />
                          {inKitchenItems.map((item) => renderItem(item, false, "in-kitchen"))}
                        </div>
                      )}
                      {sentItems.length > 0 && (
                        <div className="space-y-1.5">
                          <SectionHeader label="✓ Ready / served" count={sentItems.length} />
                          {sentItems.map((item) => renderItem(item, false, "done"))}
                        </div>
                      )}
                      {newUnsentItems.length > 0 && (
                        <div className="space-y-1.5">
                          <SectionHeader label="➕ New — not sent yet" count={newUnsentItems.length} />
                          {newUnsentItems.map((item) => renderItem(item, true, "normal"))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {order.orderItems.length > 0 && (
              <div className="mb-4 flex items-center justify-between border-t border-border-subtle pt-3">
                <span className="label-md text-ink-secondary">Running total</span>
                <PriceDisplay amount={runningTotal} size="lg" />
              </div>
            )}

            {!isFinal && (
              <div className="mb-4">
                <label htmlFor="order-notes" className="label-sm mb-1 block text-ink-secondary">
                  Order notes <span className="font-normal text-ink-faint">(e.g. no sugar, extra spicy)</span>
                </label>
                <div className="flex gap-2">
                  <textarea
                    id="order-notes"
                    rows={2}
                    placeholder="Any special requests…"
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); }}
                    className="w-full resize-none rounded-md border border-border-strong bg-surface-raised px-3 py-2 body-md text-ink-primary placeholder:text-ink-faint outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={notesSaving}
                    className="shrink-0 self-start rounded-md border border-border-strong bg-surface-raised px-3 py-2 label-sm text-ink-secondary transition hover:bg-surface-sunken disabled:opacity-50"
                  >
                    {notesSaving ? "…" : notesSaved ? "✓" : "Save"}
                  </button>
                </div>
              </div>
            )}

            {isFinal && order.notes && (
              <div className="mb-4 rounded-md bg-surface-sunken p-3">
                <p className="label-sm text-ink-secondary">Notes</p>
                <p className="body-md text-ink-primary">{order.notes}</p>
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
                  onClick={() => setConfirmingKitchen(true)}
                  disabled={
                    // Enable when: order is pending (first send) OR order has new unsent items
                    !(
                      (order.status === "pending" && order.orderItems.length > 0) ||
                      (order.status === "preparing" && newUnsentItems.length > 0)
                    )
                  }
                  variant="primary"
                  size="large"
                  className="w-full"
                >
                  {order.status === "preparing" && newUnsentItems.length > 0
                    ? `Send ${newUnsentItems.length} new item${newUnsentItems.length !== 1 ? "s" : ""} to kitchen`
                    : "Send to kitchen"}
                </Button>
                <Button
                  onClick={handleServe}
                  disabled={order.status !== "preparing" || !allItemsReady}
                  variant="secondary"
                  className="w-full"
                >
                  Serve
                </Button>
                {order.status === "preparing" && !allItemsReady && (
                  <p className="body-sm text-center text-ink-faint">
                    Waiting on the kitchen to mark every item ready.
                  </p>
                )}
                <Button onClick={handleReadyToBill} disabled={order.status !== "served"} variant="secondary" className="w-full">
                  Ready to be billed
                </Button>
                {order.status === "billed" && (
                  <InlineAlert tone="info">
                    This order is billed.{" "}
                    <Link href={`/billing/${order.id}`} className="font-semibold underline">
                      Open billing
                    </Link>
                  </InlineAlert>
                )}
                {order.status === "pending" && (
                  <Button
                    onClick={() => setConfirmingCancel(true)}
                    variant="secondary"
                    className="mt-2 w-full text-status-danger-ink"
                  >
                    Cancel order
                  </Button>
                )}
              </div>
            )}

            {error && <InlineAlert className="mt-4">{error}</InlineAlert>}
          </Card>
        </section>
      </div>

      <ConfirmDialog
        open={confirmingKitchen}
        title="Send to kitchen?"
        description={(() => {
          const newItems = order.orderItems.filter((i) => i.status === "pending");
          const isNewRound = order.status === "preparing";
          return isNewRound
            ? `${newItems.length} new item${newItems.length === 1 ? "" : "s"} will be sent. The kitchen is already preparing your earlier items.`
            : `${order.orderItems.length} item${order.orderItems.length === 1 ? "" : "s"} · Rs. ${runningTotal.toFixed(2)} total. This will notify the kitchen to start preparing.`;
        })()}
        confirmLabel="Send"
        cancelLabel="Keep editing"
        onConfirm={handleSendToKitchen}
        onCancel={() => setConfirmingKitchen(false)}
      />

      <ConfirmDialog
        open={confirmingCancel}
        title="Cancel this order?"
        description="This can't be undone. All items will be removed."
        confirmLabel="Yes, cancel"
        cancelLabel="Keep order"
        onConfirm={handleCancel}
        onCancel={() => setConfirmingCancel(false)}
      />
    </main>
  );
}
