"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { IconPlus, IconClipboardList, IconEdit, IconCheck, IconX, IconTrash, IconChevronRight } from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { StatusBadge } from "../../../components/ui/StatusBadge";

type Category = {
  id: number;
  name: string;
  sortOrder: number;
};

type Modifier = {
  id: number;
  name: string;
  priceDelta: string;
};

type MenuItem = {
  id: number;
  name: string;
  price: string;
  isAvailable: boolean;
  categoryId: number;
  category: Category;
  modifiers: Modifier[];
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
};

const selectClass =
  "min-h-12 rounded-sm border border-border-subtle bg-surface-sunken px-3 text-sm text-ink-primary outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30";

export default function MenuManagementPage() {
  const { showToast, toastHost } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<number, string>>({});
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  const [modifierNameDrafts, setModifierNameDrafts] = useState<Record<number, string>>({});
  const [modifierPriceDeltaDrafts, setModifierPriceDeltaDrafts] = useState<Record<number, string>>({});
  const [editingModifierId, setEditingModifierId] = useState<number | null>(null);

  const [itemSearch, setItemSearch] = useState("");
  const [restockDrafts, setRestockDrafts] = useState<Record<number, string>>({});

  const [activeTab, setActiveTab] = useState<"category" | "item" | "modifier">("category");

  const [categoryName, setCategoryName] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [savingItem, setSavingItem] = useState(false);

  const [modifierItemId, setModifierItemId] = useState("");
  const [modifierName, setModifierName] = useState("");
  const [modifierPriceDelta, setModifierPriceDelta] = useState("");
  const [savingModifier, setSavingModifier] = useState(false);

  const refreshAll = useCallback(async () => {
    const [categoriesRes, itemsRes] = await Promise.all([
      apiFetchJson<Category[]>("/menu/categories"),
      apiFetchJson<MenuItem[]>("/menu/all"),
    ]);
    setCategories(categoriesRes);
    setItems(itemsRes);
    setNameDrafts(Object.fromEntries(itemsRes.map((item) => [item.id, item.name])));
    setPriceDrafts(Object.fromEntries(itemsRes.map((item) => [item.id, item.price])));
    setCategoryDrafts(Object.fromEntries(itemsRes.map((item) => [item.id, String(item.categoryId)])));
    const allModifiers = itemsRes.flatMap((item) => item.modifiers);
    setModifierNameDrafts(Object.fromEntries(allModifiers.map((m) => [m.id, m.name])));
    setModifierPriceDeltaDrafts(Object.fromEntries(allModifiers.map((m) => [m.id, m.priceDelta])));
  }, []);

  useEffect(() => {
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setSavingCategory(true);
    try {
      await apiFetchJson("/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName, sortOrder: Number(categorySortOrder) }),
      });
      setCategoryName("");
      setCategorySortOrder("");
      await refreshAll();
      showToast(`Category "${categoryName}" added`);
    } catch {
      showToast("Could not add that category", "error");
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    setSavingItem(true);
    try {
      await apiFetchJson("/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: itemName,
          price: Number(itemPrice),
          categoryId: Number(itemCategoryId),
        }),
      });
      setItemName("");
      setItemPrice("");
      setItemCategoryId("");
      await refreshAll();
      showToast(`"${itemName}" added to the menu`);
    } catch {
      showToast("Could not add that item", "error");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleUpdateItem(
    item: MenuItem,
    data: { name: string; price: number; categoryId: number } | { isAvailable: boolean },
  ) {
    try {
      await apiFetchJson(`/menu/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await refreshAll();
      if ("isAvailable" in data) {
        showToast(
          data.isAvailable ? `"${item.name}" is visible on the menu again` : `"${item.name}" is now hidden from the menu`,
        );
      } else {
        showToast(`Details updated for "${data.name}"`);
      }
    } catch {
      showToast(`Could not update "${item.name}"`, "error");
    }
  }

  async function handleToggleTrackStock(item: MenuItem) {
    try {
      await apiFetchJson(`/menu/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackStock: !item.trackStock }),
      });
      await refreshAll();
      showToast(
        item.trackStock ? `Stock tracking off for "${item.name}"` : `Now tracking stock for "${item.name}"`,
      );
    } catch {
      showToast(`Could not update "${item.name}"`, "error");
    }
  }

  async function handleRestock(item: MenuItem) {
    const delta = Number(restockDrafts[item.id]);
    if (!delta) return;
    try {
      await apiFetchJson(`/menu/${item.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      setRestockDrafts((cur) => ({ ...cur, [item.id]: "" }));
      await refreshAll();
      showToast(`Stock updated for "${item.name}"`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not update stock for "${item.name}"`, "error");
    }
  }

  async function handleAddModifier(e: React.FormEvent) {
    e.preventDefault();
    setSavingModifier(true);
    try {
      await apiFetchJson(`/menu/${modifierItemId}/modifiers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modifierName, priceDelta: Number(modifierPriceDelta) }),
      });
      setModifierName("");
      setModifierPriceDelta("");
      await refreshAll();
      showToast(`Modifier "${modifierName}" added`);
    } catch {
      showToast("Could not add that modifier", "error");
    } finally {
      setSavingModifier(false);
    }
  }

  async function handleUpdateModifier(modifier: Modifier, data: { name: string; priceDelta: number }) {
    try {
      await apiFetchJson(`/menu/modifiers/${modifier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await refreshAll();
      showToast(`Modifier "${data.name}" updated`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not update "${modifier.name}"`, "error");
    }
  }

  async function handleDeleteModifier(modifier: Modifier) {
    try {
      await apiFetchJson(`/menu/modifiers/${modifier.id}`, { method: "DELETE" });
      await refreshAll();
      showToast(`Modifier "${modifier.name}" deleted`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not delete "${modifier.name}"`, "error");
    }
  }

  const selectedModifierItem = items.find((item) => item.id === Number(modifierItemId)) ?? null;
  const filteredItems = items.filter((item) => item.name.toLowerCase().includes(itemSearch.toLowerCase()));

  return (
    <div className="space-y-8">
      {toastHost}
      <div>
        <h1 className="display-md text-ink-primary">Menu Management</h1>
        <p className="body-md mt-1 text-ink-secondary">
          Manage categories, items, and modifiers. Items are hidden with the availability toggle, never deleted.
        </p>
      </div>

      <SectionCard icon={<IconPlus />} title="Add new" description="Create a category, menu item, or modifier.">
        <div className="mb-5 flex gap-1 border-b border-border-subtle">
          {(["category", "item", "modifier"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2.5 text-sm font-semibold capitalize transition ${
                activeTab === tab
                  ? "border-brand text-brand-strong"
                  : "border-transparent text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "category" && (
          <form onSubmit={handleAddCategory} className="flex flex-col gap-3 sm:max-w-md">
            <Input placeholder="Name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} required />
            <Input
              type="number"
              placeholder="Sort order"
              value={categorySortOrder}
              onChange={(e) => setCategorySortOrder(e.target.value)}
              required
            />
            <Button type="submit" disabled={savingCategory} className="self-start">
              Add category
            </Button>
          </form>
        )}

        {activeTab === "item" && (
          <form onSubmit={handleAddItem} className="flex flex-col gap-3 sm:max-w-md">
            <Input placeholder="Name" value={itemName} onChange={(e) => setItemName(e.target.value)} required />
            <Input
              type="number"
              step="0.01"
              placeholder="Price"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              required
            />
            <select
              className={selectClass}
              value={itemCategoryId}
              onChange={(e) => setItemCategoryId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select a category
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={savingItem} className="self-start">
              Add item
            </Button>
          </form>
        )}

        {activeTab === "modifier" && (
          <form onSubmit={handleAddModifier} className="flex flex-col gap-3 sm:max-w-md">
            <select
              className={selectClass}
              value={modifierItemId}
              onChange={(e) => setModifierItemId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select a menu item
              </option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            {selectedModifierItem && (
              <div className="rounded-md border border-border-subtle bg-surface-sunken p-3">
                <p className="body-md font-semibold text-ink-primary">
                  Adding to &ldquo;{selectedModifierItem.name}&rdquo; · Rs. {selectedModifierItem.price}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedModifierItem.modifiers.length === 0 ? (
                    <span className="body-sm text-ink-faint">No modifiers yet.</span>
                  ) : (
                    selectedModifierItem.modifiers.map((m) => (
                      <span key={m.id} className="label-sm rounded-pill bg-surface-raised px-3 py-1 text-ink-secondary normal-case">
                        {m.name} +Rs. {m.priceDelta}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            <Input
              placeholder="Name (e.g. Extra Shot)"
              value={modifierName}
              onChange={(e) => setModifierName(e.target.value)}
              required
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Price delta"
              value={modifierPriceDelta}
              onChange={(e) => setModifierPriceDelta(e.target.value)}
              required
            />
            <Button type="submit" disabled={savingModifier} className="self-start">
              Add modifier
            </Button>
          </form>
        )}
      </SectionCard>

      <SectionCard
        icon={<IconClipboardList />}
        title="Menu items"
        description="Search, reprice, or hide items without deleting them. Expand a row to manage its modifiers."
      >
        <div className="mb-5 sm:max-w-xs">
          <Input pill placeholder="Search items…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-surface-sunken" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="label-sm border-b border-border-subtle text-ink-secondary">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">Price</th>
                  <th className="py-3 pr-4">Stock</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isEditing = editingItemId === item.id;
                  const isExpanded = expandedItemId === item.id;
                  const nameDraft = nameDrafts[item.id] ?? item.name;
                  const draft = priceDrafts[item.id] ?? item.price;
                  const categoryDraft = categoryDrafts[item.id] ?? String(item.categoryId);
                  return (
                    <Fragment key={item.id}>
                      <tr className="border-b border-border-subtle last:border-0">
                        <td className="py-4 pr-4 font-medium text-ink-primary">
                          {isEditing ? (
                            <Input
                              autoFocus
                              className="w-44"
                              value={nameDraft}
                              onChange={(e) => setNameDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))}
                            />
                          ) : (
                            item.name
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          {isEditing ? (
                            <select
                              className={selectClass}
                              value={categoryDraft}
                              onChange={(e) => setCategoryDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))}
                            >
                              {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="label-sm rounded-pill bg-surface-sunken px-3 py-1 text-ink-secondary normal-case">
                              {item.category.name}
                            </span>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-faint">Rs.</span>
                              <Input
                                type="number"
                                step="0.01"
                                className="w-28"
                                value={draft}
                                onChange={(e) => setPriceDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))}
                              />
                            </div>
                          ) : (
                            <span className="body-md font-semibold text-ink-primary">Rs. {item.price}</span>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          {item.trackStock ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={`body-md font-semibold ${
                                  item.stockQuantity <= item.lowStockThreshold
                                    ? "text-status-danger-ink"
                                    : "text-ink-primary"
                                }`}
                              >
                                {item.stockQuantity}
                              </span>
                              <Input
                                type="number"
                                placeholder="±"
                                className="w-16"
                                value={restockDrafts[item.id] ?? ""}
                                onChange={(e) => setRestockDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))}
                              />
                              <button
                                type="button"
                                aria-label={`Apply stock change for ${item.name}`}
                                onClick={() => handleRestock(item)}
                                disabled={!restockDrafts[item.id]}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition hover:bg-surface-sunken disabled:opacity-40"
                              >
                                <IconCheck className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleTrackStock(item)}
                                className="label-sm text-ink-faint underline-offset-2 hover:underline"
                              >
                                Stop tracking
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleTrackStock(item)}
                              className="label-sm text-ink-faint underline-offset-2 hover:text-ink-secondary hover:underline"
                            >
                              Not tracked · Track
                            </button>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          <button type="button" onClick={() => handleUpdateItem(item, { isAvailable: !item.isAvailable })}>
                            <StatusBadge tone={item.isAvailable ? "success" : "neutral"}>
                              {item.isAvailable ? "Available" : "Hidden"}
                            </StatusBadge>
                          </button>
                        </td>
                        <td className="py-4 pr-0 text-right">
                          <div className="flex justify-end gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Save changes for ${item.name}`}
                                  onClick={() => {
                                    handleUpdateItem(item, {
                                      name: nameDraft,
                                      price: Number(draft),
                                      categoryId: Number(categoryDraft),
                                    });
                                    setEditingItemId(null);
                                  }}
                                  className="flex h-9 w-9 items-center justify-center rounded-md text-status-success-ink transition hover:bg-status-success-tint"
                                >
                                  <IconCheck className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Cancel edit"
                                  onClick={() => {
                                    setNameDrafts((cur) => ({ ...cur, [item.id]: item.name }));
                                    setPriceDrafts((cur) => ({ ...cur, [item.id]: item.price }));
                                    setCategoryDrafts((cur) => ({ ...cur, [item.id]: String(item.categoryId) }));
                                    setEditingItemId(null);
                                  }}
                                  className="flex h-9 w-9 items-center justify-center rounded-md text-ink-faint transition hover:bg-surface-sunken"
                                >
                                  <IconX className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Edit ${item.name}`}
                                onClick={() => setEditingItemId(item.id)}
                                className="flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition hover:bg-surface-sunken"
                              >
                                <IconEdit className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={isExpanded ? `Hide modifiers for ${item.name}` : `Show modifiers for ${item.name}`}
                              onClick={() => setExpandedItemId((cur) => (cur === item.id ? null : item.id))}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition hover:bg-surface-sunken"
                            >
                              <IconChevronRight
                                className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border-subtle bg-surface-sunken">
                          <td colSpan={6} className="px-4 py-4">
                            <p className="label-sm mb-3 text-ink-faint">Modifiers for {item.name}</p>
                            {item.modifiers.length === 0 ? (
                              <p className="body-sm text-ink-faint">No modifiers for this item.</p>
                            ) : (
                              <div className="space-y-2">
                                {item.modifiers.map((modifier) => {
                                  const isEditingMod = editingModifierId === modifier.id;
                                  const modNameDraft = modifierNameDrafts[modifier.id] ?? modifier.name;
                                  const modDeltaDraft = modifierPriceDeltaDrafts[modifier.id] ?? modifier.priceDelta;
                                  return (
                                    <div
                                      key={modifier.id}
                                      className="flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-surface-raised px-3 py-2.5"
                                    >
                                      {isEditingMod ? (
                                        <>
                                          <Input
                                            autoFocus
                                            className="w-40"
                                            value={modNameDraft}
                                            onChange={(e) =>
                                              setModifierNameDrafts((cur) => ({ ...cur, [modifier.id]: e.target.value }))
                                            }
                                          />
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-sm text-ink-faint">Rs.</span>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              className="w-24"
                                              value={modDeltaDraft}
                                              onChange={(e) =>
                                                setModifierPriceDeltaDrafts((cur) => ({
                                                  ...cur,
                                                  [modifier.id]: e.target.value,
                                                }))
                                              }
                                            />
                                          </div>
                                          <div className="ml-auto flex gap-1.5">
                                            <button
                                              type="button"
                                              aria-label={`Save modifier ${modifier.name}`}
                                              onClick={() => {
                                                handleUpdateModifier(modifier, {
                                                  name: modNameDraft,
                                                  priceDelta: Number(modDeltaDraft),
                                                });
                                                setEditingModifierId(null);
                                              }}
                                              className="flex h-8 w-8 items-center justify-center rounded-md text-status-success-ink transition hover:bg-status-success-tint"
                                            >
                                              <IconCheck className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              aria-label="Cancel edit"
                                              onClick={() => {
                                                setModifierNameDrafts((cur) => ({ ...cur, [modifier.id]: modifier.name }));
                                                setModifierPriceDeltaDrafts((cur) => ({
                                                  ...cur,
                                                  [modifier.id]: modifier.priceDelta,
                                                }));
                                                setEditingModifierId(null);
                                              }}
                                              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-faint transition hover:bg-surface-sunken"
                                            >
                                              <IconX className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <span className="body-md font-semibold text-ink-primary">{modifier.name}</span>
                                          <span className="body-sm text-ink-secondary">+Rs. {modifier.priceDelta}</span>
                                          <div className="ml-auto flex gap-1.5">
                                            <button
                                              type="button"
                                              aria-label={`Edit modifier ${modifier.name}`}
                                              onClick={() => setEditingModifierId(modifier.id)}
                                              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary transition hover:bg-surface-sunken"
                                            >
                                              <IconEdit className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              aria-label={`Delete modifier ${modifier.name}`}
                                              onClick={() => handleDeleteModifier(modifier)}
                                              className="flex h-8 w-8 items-center justify-center rounded-md text-status-danger-ink transition hover:bg-status-danger-tint"
                                            >
                                              <IconTrash className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="body-md py-8 text-center text-ink-faint">
                      {items.length === 0 ? "No menu items yet." : "No items match your search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
