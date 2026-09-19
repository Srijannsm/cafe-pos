"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getCurrentUser } from "../../lib/api";
import { useRequireAuth } from "../../lib/useRequireAuth";
import { NavBar } from "../../components/NavBar";
import { useToast } from "../../components/Toast";

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

type TableRow = {
  id: number;
  tableNumber: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
};

const inputClass =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle";

export default function AdminPage() {
  const router = useRouter();
  const ready = useRequireAuth();
  const [authorized, setAuthorized] = useState(false);
  const { showToast, toastHost } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [tableDrafts, setTableDrafts] = useState<Record<number, { tableNumber: string; capacity: string }>>({});

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

  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("");
  const [savingTable, setSavingTable] = useState(false);

  const refreshAll = useCallback(async () => {
    const [categoriesRes, itemsRes, tablesRes] = await Promise.all([
      apiFetchJson<Category[]>("/menu/categories"),
      apiFetchJson<MenuItem[]>("/menu/all"),
      apiFetchJson<TableRow[]>("/tables"),
    ]);
    setCategories(categoriesRes);
    setItems(itemsRes);
    setTables(tablesRes);
    setPriceDrafts(Object.fromEntries(itemsRes.map((item) => [item.id, item.price])));
    setTableDrafts(
      Object.fromEntries(
        tablesRes.map((table) => [table.id, { tableNumber: table.tableNumber, capacity: String(table.capacity) }]),
      ),
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    const user = getCurrentUser();
    if (user?.role !== "admin") {
      router.replace("/");
      return;
    }
    setAuthorized(true);
  }, [ready, router]);

  useEffect(() => {
    if (!authorized) return;
    refreshAll().finally(() => setLoading(false));
  }, [authorized, refreshAll]);

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
      showToast("Category added");
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
      showToast("Menu item added");
    } catch {
      showToast("Could not add that item", "error");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleUpdateItem(id: number, data: Record<string, unknown>) {
    try {
      await apiFetchJson(`/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await refreshAll();
      showToast("Item updated");
    } catch {
      showToast("Could not update that item", "error");
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
      showToast("Modifier added");
    } catch {
      showToast("Could not add that modifier", "error");
    } finally {
      setSavingModifier(false);
    }
  }

  async function handleAddTable(e: React.FormEvent) {
    e.preventDefault();
    setSavingTable(true);
    try {
      await apiFetchJson("/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: newTableNumber, capacity: Number(newTableCapacity) }),
      });
      setNewTableNumber("");
      setNewTableCapacity("");
      await refreshAll();
      showToast("Table added");
    } catch {
      showToast("Could not add that table", "error");
    } finally {
      setSavingTable(false);
    }
  }

  async function handleUpdateTable(id: number, data: Record<string, unknown>) {
    try {
      await apiFetchJson(`/tables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await refreshAll();
      showToast("Table updated");
    } catch {
      showToast("Could not update that table", "error");
    }
  }

  if (!ready || !authorized) {
    return (
      <main className="min-h-screen">
        <NavBar />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <NavBar />
      {toastHost}
      <div className="space-y-8 p-4 sm:p-6">
        <h1 className="text-2xl font-bold text-stone-900">Admin</h1>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-stone-900">Menu management</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <form onSubmit={handleAddCategory} className="card flex flex-col gap-3 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-stone-400">Add category</h3>
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
              <button type="submit" disabled={savingCategory} className="btn btn-primary">
                Add category
              </button>
            </form>

            <form onSubmit={handleAddItem} className="card flex flex-col gap-3 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-stone-400">Add menu item</h3>
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
              <button type="submit" disabled={savingItem} className="btn btn-primary">
                Add item
              </button>
            </form>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-400">Existing items</h3>
            {loading ? (
              <p className="text-sm text-stone-400">Loading…</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const draft = priceDrafts[item.id] ?? item.price;
                  const priceChanged = draft !== item.price;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 p-3 text-sm"
                    >
                      <span className="min-w-32 flex-1 font-medium text-stone-800">{item.name}</span>
                      <span className="text-xs text-stone-400">{item.category.name}</span>
                      <input
                        className="w-24 rounded-lg border border-stone-300 px-2 py-1"
                        type="number"
                        step="0.01"
                        value={draft}
                        onChange={(e) => setPriceDrafts((cur) => ({ ...cur, [item.id]: e.target.value }))}
                      />
                      {priceChanged && (
                        <button
                          className="btn btn-secondary !min-h-0 !py-1.5 !px-3 text-xs"
                          onClick={() => handleUpdateItem(item.id, { price: Number(draft) })}
                        >
                          Save
                        </button>
                      )}
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
                        <input
                          type="checkbox"
                          checked={item.isAvailable}
                          onChange={(e) => handleUpdateItem(item.id, { isAvailable: e.target.checked })}
                        />
                        Available
                      </label>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="text-sm text-stone-400">No menu items yet.</p>}
              </div>
            )}
          </div>

          <form onSubmit={handleAddModifier} className="card flex flex-col gap-3 p-4 sm:max-w-md">
            <h3 className="text-sm font-bold uppercase tracking-wide text-stone-400">Add modifier</h3>
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
            <button type="submit" disabled={savingModifier} className="btn btn-primary">
              Add modifier
            </button>
          </form>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-stone-900">Table management</h2>

          <form onSubmit={handleAddTable} className="card flex flex-col gap-3 p-4 sm:max-w-md">
            <h3 className="text-sm font-bold uppercase tracking-wide text-stone-400">Add table</h3>
            <input
              className={inputClass}
              placeholder="Table number"
              value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
              required
            />
            <input
              className={inputClass}
              type="number"
              placeholder="Capacity"
              value={newTableCapacity}
              onChange={(e) => setNewTableCapacity(e.target.value)}
              required
            />
            <button type="submit" disabled={savingTable} className="btn btn-primary">
              Add table
            </button>
          </form>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-400">Existing tables</h3>
            {loading ? (
              <p className="text-sm text-stone-400">Loading…</p>
            ) : (
              <div className="space-y-2">
                {tables.map((table) => {
                  const draft = tableDrafts[table.id] ?? {
                    tableNumber: table.tableNumber,
                    capacity: String(table.capacity),
                  };
                  const changed =
                    draft.tableNumber !== table.tableNumber || draft.capacity !== String(table.capacity);
                  return (
                    <div
                      key={table.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 p-3 text-sm"
                    >
                      <input
                        className="w-28 rounded-lg border border-stone-300 px-2 py-1"
                        value={draft.tableNumber}
                        onChange={(e) =>
                          setTableDrafts((cur) => ({
                            ...cur,
                            [table.id]: { ...draft, tableNumber: e.target.value },
                          }))
                        }
                      />
                      <input
                        className="w-20 rounded-lg border border-stone-300 px-2 py-1"
                        type="number"
                        value={draft.capacity}
                        onChange={(e) =>
                          setTableDrafts((cur) => ({
                            ...cur,
                            [table.id]: { ...draft, capacity: e.target.value },
                          }))
                        }
                      />
                      {changed && (
                        <button
                          className="btn btn-secondary !min-h-0 !py-1.5 !px-3 text-xs"
                          onClick={() =>
                            handleUpdateTable(table.id, {
                              tableNumber: draft.tableNumber,
                              capacity: Number(draft.capacity),
                            })
                          }
                        >
                          Save
                        </button>
                      )}
                    </div>
                  );
                })}
                {tables.length === 0 && <p className="text-sm text-stone-400">No tables yet.</p>}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
