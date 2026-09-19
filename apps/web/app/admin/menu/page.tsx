"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import {
  IconPlus,
  IconClipboardList,
  IconSearch,
  IconEdit,
  IconCheck,
  IconX,
  IconTrash,
  IconChevronRight,
} from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";

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
};

const inputClass =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle";

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
        <h1 className="text-3xl font-bold text-stone-900">Menu Management</h1>
        <p className="mt-1 text-sm text-stone-500">
          Manage categories, items, and modifiers. Items are hidden with the availability toggle, never deleted.
        </p>
      </div>

      <SectionCard icon={<IconPlus />} title="Add new" description="Create a category, menu item, or modifier.">
        <div className="mb-5 flex gap-1 border-b border-stone-200">
          {(["category", "item", "modifier"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2.5 text-sm font-semibold capitalize transition ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "category" && (
          <form onSubmit={handleAddCategory} className="flex flex-col gap-3 sm:max-w-md">
            <input
              className={inputClass}
              placeholder="Name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
            />
            <input
              className={inputClass}
              type="number"
              placeholder="Sort order"
              value={categorySortOrder}
              onChange={(e) => setCategorySortOrder(e.target.value)}
              required
            />
            <button type="submit" disabled={savingCategory} className="btn btn-primary self-start">
              Add category
            </button>
          </form>
        )}

        {activeTab === "item" && (
          <form onSubmit={handleAddItem} className="flex flex-col gap-3 sm:max-w-md">
            <input
              className={inputClass}
              placeholder="Name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
            />
            <input
              className={inputClass}
              type="number"
              step="0.01"
              placeholder="Price"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              required
            />
            <select
              className={inputClass}
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
            <button type="submit" disabled={savingItem} className="btn btn-primary self-start">
              Add item
            </button>
          </form>
        )}

        {activeTab === "modifier" && (
          <form onSubmit={handleAddModifier} className="flex flex-col gap-3 sm:max-w-md">
            <select
              className={inputClass}
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
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                <p className="text-sm font-semibold text-stone-800">
                  Adding to &ldquo;{selectedModifierItem.name}&rdquo; · रु {selectedModifierItem.price}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedModifierItem.modifiers.length === 0 ? (
                    <span className="text-xs text-stone-400">No modifiers yet.</span>
                  ) : (
                    selectedModifierItem.modifiers.map((m) => (
                      <span key={m.id} className="badge normal-case bg-stone-200 text-stone-600">
                        {m.name} +रु {m.priceDelta}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            <input
              className={inputClass}
              placeholder="Name (e.g. Extra Shot)"
              value={modifierName}
              onChange={(e) => setModifierName(e.target.value)}
              required
            />
            <input
              className={inputClass}
              type="number"
              step="0.01"
              placeholder="Price delta"
              value={modifierPriceDelta}
              onChange={(e) => setModifierPriceDelta(e.target.value)}
              required
            />
            <button type="submit" disabled={savingModifier} className="btn btn-primary self-start">
              Add modifier
            </button>
          </form>
        )}
      </SectionCard>

      <SectionCard
        icon={<IconClipboardList />}
        title="Menu items"
        description="Search, reprice, or hide items without deleting them. Expand a row to manage its modifiers."
      >
        <div className="relative mb-5 sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            className="w-full rounded-xl border border-stone-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
            placeholder="Search items…"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-stone-200" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wide text-stone-400">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">Price</th>
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
                      <tr className="border-b border-stone-100 last:border-0">
                        <td className="py-4 pr-4 font-medium text-stone-900">
                          {isEditing ? (
                            <input
                              autoFocus
                              className="w-44 rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-semibold text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
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
                              className="rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-semibold text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
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
                            <span className="badge normal-case bg-stone-100 text-stone-600">{item.category.name}</span>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-stone-400">रु</span>
                              <input
                                type="number"
                                step="0.01"
                                className="w-28 rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-semibold text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
                                value={draft}
                                onChange={(e) => setPriceDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))}
                              />
                            </div>
                          ) : (
                            <span className="font-semibold text-stone-800">रु {item.price}</span>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(item, { isAvailable: !item.isAvailable })}
                            className={`badge normal-case transition active:scale-95 ${
                              item.isAvailable
                                ? "bg-success-subtle text-success-subtle-fg hover:bg-emerald-100"
                                : "bg-stone-200 text-stone-500 hover:bg-stone-300"
                            }`}
                          >
                            {item.isAvailable ? "Available" : "Hidden"}
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
                                  className="flex h-9 w-9 items-center justify-center rounded-lg text-success transition hover:bg-success-subtle"
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
                                  className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100"
                                >
                                  <IconX className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                aria-label={`Edit ${item.name}`}
                                onClick={() => setEditingItemId(item.id)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100"
                              >
                                <IconEdit className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={isExpanded ? `Hide modifiers for ${item.name}` : `Show modifiers for ${item.name}`}
                              onClick={() => setExpandedItemId((cur) => (cur === item.id ? null : item.id))}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100"
                            >
                              <IconChevronRight
                                className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-stone-100 bg-stone-50">
                          <td colSpan={5} className="px-4 py-4">
                            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-stone-400">
                              Modifiers for {item.name}
                            </p>
                            {item.modifiers.length === 0 ? (
                              <p className="text-sm text-stone-400">No modifiers for this item.</p>
                            ) : (
                              <div className="space-y-2">
                                {item.modifiers.map((modifier) => {
                                  const isEditingMod = editingModifierId === modifier.id;
                                  const modNameDraft = modifierNameDrafts[modifier.id] ?? modifier.name;
                                  const modDeltaDraft = modifierPriceDeltaDrafts[modifier.id] ?? modifier.priceDelta;
                                  return (
                                    <div
                                      key={modifier.id}
                                      className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5"
                                    >
                                      {isEditingMod ? (
                                        <>
                                          <input
                                            autoFocus
                                            className="w-40 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm font-semibold text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
                                            value={modNameDraft}
                                            onChange={(e) =>
                                              setModifierNameDrafts((cur) => ({ ...cur, [modifier.id]: e.target.value }))
                                            }
                                          />
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-sm text-stone-400">रु</span>
                                            <input
                                              type="number"
                                              step="0.01"
                                              className="w-24 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm font-semibold text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
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
                                              className="flex h-8 w-8 items-center justify-center rounded-lg text-success transition hover:bg-success-subtle"
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
                                              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100"
                                            >
                                              <IconX className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <span className="font-semibold text-stone-800">{modifier.name}</span>
                                          <span className="text-sm text-stone-500">+रु {modifier.priceDelta}</span>
                                          <div className="ml-auto flex gap-1.5">
                                            <button
                                              type="button"
                                              aria-label={`Edit modifier ${modifier.name}`}
                                              onClick={() => setEditingModifierId(modifier.id)}
                                              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100"
                                            >
                                              <IconEdit className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              aria-label={`Delete modifier ${modifier.name}`}
                                              onClick={() => handleDeleteModifier(modifier)}
                                              className="flex h-8 w-8 items-center justify-center rounded-lg text-danger transition hover:bg-danger-subtle"
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
                    <td colSpan={5} className="py-8 text-center text-sm text-stone-400">
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
