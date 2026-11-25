"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { useCafeSettings } from "../../../lib/CafeSettingsContext";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Drawer } from "../../../components/ui/Drawer";
import { Switch } from "../../../components/ui/Switch";
import { Field, Panel, Pill, inputClass } from "../../../components/ui/Field";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Skeleton } from "../../../components/ui/Skeleton";
import {
  IconPlus, IconSearch, IconImage, IconTrash, IconGrip, IconEdit, IconUpload, IconX, IconClipboardList,
} from "../../../components/icons";
import { assetUrl, rs } from "../../../lib/format";
import { uploadImage } from "../../../lib/upload";
import {
  type AdminMenuItem, type Category, type Station, STATIONS, TAGS, orderedCategories,
} from "../../../lib/menu-types";

type StockItem = { id: number; name: string; unit: string; avgCost: string; isActive: boolean };

type Draft = {
  id?: number;
  name: string;
  price: string;
  categoryId: number | "";
  description: string;
  imageUrl: string | null;
  tags: string[];
  station: Station;
  costPrice: string;
  isAvailable: boolean;
  trackStock: boolean;
  stockQuantity: string;
  lowStockThreshold: string;
};

const EMPTY: Draft = {
  name: "", price: "", categoryId: "", description: "", imageUrl: null, tags: [], station: "kitchen",
  costPrice: "", isAvailable: true, trackStock: false, stockQuantity: "0", lowStockThreshold: "5",
};

export default function MenuItemsPage() {
  const { showToast, toastHost } = useToast();
  const { settings } = useCafeSettings();
  const [items, setItems] = useState<AdminMenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<number | "all">("all");
  const [availFilter, setAvailFilter] = useState<"all" | "available" | "soldout">("all");
  const [editing, setEditing] = useState<AdminMenuItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminMenuItem | null>(null);
  const dragId = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([
        apiFetchJson<AdminMenuItem[]>("/menu/all"),
        apiFetchJson<Category[]>("/menu/categories"),
      ]);
      setItems(m);
      setCategories(c);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
    apiFetchJson<StockItem[]>("/inventory/items").then(setStockItems).catch(() => {});
  }, [load]);

  const cats = useMemo(() => orderedCategories(categories), [categories]);
  const catPath = (id: number) => cats.find((c) => c.id === id)?.path ?? "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inCat = (i: AdminMenuItem) =>
      catFilter === "all" || i.categoryId === catFilter || i.category.parentId === catFilter;
    return items
      .filter(inCat)
      .filter((i) => availFilter === "all" || (availFilter === "available" ? i.isAvailable : !i.isAvailable))
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
  }, [items, search, catFilter, availFilter]);

  // Reordering only makes sense inside one category with no search applied.
  const canReorder = catFilter !== "all" && !search && availFilter === "all";

  async function toggleAvailable(item: AdminMenuItem, next: boolean) {
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, isAvailable: next } : i))); // optimistic
    try {
      await apiFetchJson(`/menu/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: next }),
      });
      showToast(next ? `${item.name} is back on the menu` : `${item.name} marked sold out`);
    } catch (e) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, isAvailable: !next } : i)));
      showToast((e as Error).message, "error");
    }
  }

  async function onDrop(targetId: number) {
    const from = dragId.current;
    dragId.current = null;
    if (from == null || from === targetId) return;
    const ids = filtered.map((i) => i.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(targetId);
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]!);
    setItems((list) => {
      const order = new Map(ids.map((id, i) => [id, i]));
      return [...list].map((i) => (order.has(i.id) ? { ...i, sortOrder: order.get(i.id)! } : i)).sort((a, b) =>
        a.category.sortOrder - b.category.sortOrder || a.sortOrder - b.sortOrder,
      );
    });
    try {
      await apiFetchJson("/menu/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "item", ids }),
      });
    } catch (e) {
      showToast((e as Error).message, "error");
      load();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      const res = await apiFetchJson<{ archived: boolean }>(`/menu/${deleting.id}`, { method: "DELETE" });
      showToast(res.archived ? `${deleting.name} has past sales, so it was hidden instead` : `${deleting.name} deleted`);
      setDeleting(null);
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  const soldOut = items.filter((i) => !i.isAvailable).length;

  return (
    <div>
      {toastHost}
      <PageHeader
        title="Menu items"
        description={`${items.length} items · ${soldOut} sold out`}
        actions={
          <Button
            icon={<IconPlus />}
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
            disabled={categories.length === 0}
          >
            Add item
          </Button>
        }
      />

      {!loading && categories.length === 0 && (
        <Panel className="mb-6">
          <EmptyState
            icon={<IconClipboardList className="h-6 w-6" />}
            title="Start with a category"
            description="Items live inside categories like Coffee, Momo or Hookah. Create one first."
            action={<a href="/admin/menu/categories"><Button>Create categories</Button></a>}
          />
        </Panel>
      )}

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
          <div className="relative min-w-[200px] flex-1">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className={`${inputClass} w-full pl-10`}
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className={`${inputClass} w-auto min-w-[180px]`}
            aria-label="Category"
          >
            <option value="all">All categories</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.depth ? "— " : ""}{c.name}
              </option>
            ))}
          </select>
          <select
            value={availFilter}
            onChange={(e) => setAvailFilter(e.target.value as typeof availFilter)}
            className={`${inputClass} w-auto`}
            aria-label="Availability"
          >
            <option value="all">Any status</option>
            <option value="available">Available</option>
            <option value="soldout">Sold out</option>
          </select>
        </div>

        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No items match" description="Try another search or category." className="py-14" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-3 py-3">Item</th>
                  <th className="hidden px-3 py-3 md:table-cell">Category</th>
                  <th className="hidden px-3 py-3 lg:table-cell">Station</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3 text-center">Available</th>
                  <th className="w-24 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const img = assetUrl(item.imageUrl);
                  const low = item.trackStock && item.stockQuantity <= item.lowStockThreshold;
                  return (
                    <tr
                      key={item.id}
                      draggable={canReorder}
                      onDragStart={() => (dragId.current = item.id)}
                      onDragOver={(e) => canReorder && e.preventDefault()}
                      onDrop={() => canReorder && onDrop(item.id)}
                      onClick={() => {
                        setEditing(item);
                        setDrawerOpen(true);
                      }}
                      className={`cursor-pointer border-b border-border-subtle last:border-0 transition hover:bg-surface-canvas ${item.isAvailable ? "" : "opacity-60"}`}
                    >
                      <td className="px-2 py-3 text-ink-faint">
                        {canReorder && <IconGrip className="h-4 w-4 cursor-grab" />}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          {img ? (
                            <img src={img} alt="" width={44} height={33} loading="lazy" className="h-[33px] w-11 shrink-0 rounded-md object-cover" />
                          ) : (
                            <span className="flex h-[33px] w-11 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-faint">
                              <IconImage className="h-4 w-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-medium text-ink-primary">
                              <span className="truncate">{item.name}</span>
                              {item.tags.map((t) => (
                                <span key={t} title={TAGS.find((x) => x.value === t)?.label} className="text-xs">
                                  {TAGS.find((x) => x.value === t)?.emoji}
                                </span>
                              ))}
                            </p>
                            <p className="truncate text-xs text-ink-faint">
                              {item.description || (item.modifiers.length ? `${item.modifiers.length} options` : "No description")}
                              {item.trackStock && (
                                <span className={low ? "ml-2 font-medium text-status-warning-ink" : "ml-2"}>· {item.stockQuantity} left</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 text-ink-secondary md:table-cell">{catPath(item.categoryId)}</td>
                      <td className="hidden px-3 py-3 capitalize text-ink-secondary lg:table-cell">{item.station}</td>
                      <td className="tabular px-3 py-3 text-right font-medium text-ink-primary">{rs(item.price)}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
                          <Switch size="sm" checked={item.isAvailable} onChange={(v) => toggleAvailable(item, v)} label={`${item.name} available`} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button type="button" aria-label="Edit" className="rounded-lg p-2 text-ink-faint hover:bg-surface-sunken hover:text-ink-primary" onClick={() => { setEditing(item); setDrawerOpen(true); }}>
                            <IconEdit className="h-4 w-4" />
                          </button>
                          <button type="button" aria-label="Delete" className="rounded-lg p-2 text-ink-faint hover:bg-status-danger-tint hover:text-status-danger-ink" onClick={() => setDeleting(item)}>
                            <IconTrash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!canReorder && catFilter === "all" && (
              <p className="border-t border-border-subtle px-4 py-3 text-xs text-ink-faint">
                Tip: pick a category to drag items into the order waiters and customers see.
              </p>
            )}
          </div>
        )}
      </Panel>

      <ItemDrawer
        open={drawerOpen}
        item={editing}
        categories={cats}
        stockItems={stockItems}
        inventoryOn={settings?.inventoryEnabled !== false}
        onClose={() => setDrawerOpen(false)}
        onSaved={(msg) => {
          showToast(msg);
          setDrawerOpen(false);
          load();
        }}
        onError={(m) => showToast(m, "error")}
        defaultCategoryId={catFilter === "all" ? undefined : catFilter}
      />

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? "item"}?`}
        description="If it was ever sold it will be hidden instead, so old bills stay correct."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function ItemDrawer({
  open, item, categories, stockItems, inventoryOn, onClose, onSaved, onError, defaultCategoryId,
}: {
  open: boolean;
  item: AdminMenuItem | null;
  categories: (Category & { depth: number; path: string })[];
  stockItems: StockItem[];
  inventoryOn: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  defaultCategoryId?: number;
}) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modifiers, setModifiers] = useState<{ id?: number; name: string; priceDelta: string }[]>([]);
  const [removedMods, setRemovedMods] = useState<number[]>([]);
  const [recipe, setRecipe] = useState<{ stockItemId: number | ""; quantity: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setD({
        id: item.id, name: item.name, price: item.price, categoryId: item.categoryId,
        description: item.description ?? "", imageUrl: item.imageUrl, tags: item.tags ?? [], station: item.station,
        costPrice: item.costPrice ?? "", isAvailable: item.isAvailable, trackStock: item.trackStock,
        stockQuantity: String(item.stockQuantity), lowStockThreshold: String(item.lowStockThreshold),
      });
      setModifiers(item.modifiers.map((m) => ({ id: m.id, name: m.name, priceDelta: String(Number(m.priceDelta)) })));
      setRecipe((item.recipe ?? []).map((r) => ({ stockItemId: r.stockItemId, quantity: String(Number(r.quantity)) })));
    } else {
      setD({ ...EMPTY, categoryId: defaultCategoryId ?? categories[0]?.id ?? "" });
      setModifiers([]);
      setRecipe([]);
    }
    setRemovedMods([]);
  }, [open, item, defaultCategoryId, categories]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "menu", 4 / 3, 1200);
      set("imageUrl", url);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const recipeCost = recipe.reduce((sum, r) => {
    const s = stockItems.find((x) => x.id === r.stockItemId);
    return sum + (s ? Number(s.avgCost) * Number(r.quantity || 0) : 0);
  }, 0);
  const effectiveCost = recipeCost > 0 ? recipeCost : Number(d.costPrice || 0);
  const margin = Number(d.price) > 0 && effectiveCost > 0 ? ((Number(d.price) - effectiveCost) / Number(d.price)) * 100 : null;

  async function save() {
    if (!d.name.trim() || !d.price || !d.categoryId) {
      onError("Name, price and category are required");
      return;
    }
    setSaving(true);
    const body = {
      name: d.name.trim(),
      price: Number(d.price),
      categoryId: Number(d.categoryId),
      description: d.description.trim(),
      imageUrl: d.imageUrl ?? undefined,
      tags: d.tags,
      station: d.station,
      costPrice: d.costPrice === "" ? undefined : Number(d.costPrice),
      isAvailable: d.isAvailable,
      trackStock: d.trackStock,
      stockQuantity: d.trackStock && !d.id ? Number(d.stockQuantity || 0) : undefined,
      lowStockThreshold: Number(d.lowStockThreshold || 0),
    };
    const json = { "Content-Type": "application/json" };
    try {
      const saved = await apiFetchJson<AdminMenuItem>(d.id ? `/menu/${d.id}` : "/menu", {
        method: d.id ? "PATCH" : "POST",
        headers: json,
        body: JSON.stringify(d.id ? body : { ...body, imageUrl: d.imageUrl ?? undefined }),
      });
      if (d.id && d.imageUrl === null && item?.imageUrl) {
        await apiFetchJson(`/menu/${d.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ imageUrl: null }) }).catch(() => {});
      }
      // Options: delete removed, update changed, add new.
      for (const id of removedMods) await apiFetchJson(`/menu/modifiers/${id}`, { method: "DELETE" });
      for (const m of modifiers) {
        if (!m.name.trim()) continue;
        const payload = JSON.stringify({ name: m.name.trim(), priceDelta: Number(m.priceDelta || 0) });
        if (m.id) {
          const orig = item?.modifiers.find((x) => x.id === m.id);
          if (orig && (orig.name !== m.name.trim() || Number(orig.priceDelta) !== Number(m.priceDelta || 0))) {
            await apiFetchJson(`/menu/modifiers/${m.id}`, { method: "PATCH", headers: json, body: payload });
          }
        } else {
          await apiFetchJson(`/menu/${saved.id}/modifiers`, { method: "POST", headers: json, body: payload });
        }
      }
      if (inventoryOn) {
        const lines = recipe.filter((r) => r.stockItemId && Number(r.quantity) > 0).map((r) => ({ stockItemId: Number(r.stockItemId), quantity: Number(r.quantity) }));
        const before = item?.recipe?.length ?? 0;
        if (lines.length || before) {
          await apiFetchJson(`/menu/${saved.id}/recipe`, { method: "PATCH", headers: json, body: JSON.stringify({ lines }) });
        }
      }
      onSaved(d.id ? "Item updated" : "Item added");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const img = assetUrl(d.imageUrl);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={item ? "Edit item" : "New item"}
      subtitle={item ? item.name : "Shows on the waiter app and the QR menu"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={uploading}>{item ? "Save changes" : "Add item"}</Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Photo */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-primary">Photo</p>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-canvas">
            {img ? (
              <>
                <img src={img} alt="" className="h-full w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-ink-primary shadow-sm">Replace</button>
                  <button type="button" onClick={() => set("imageUrl", null)} aria-label="Remove photo" className="rounded-lg bg-white/90 p-1.5 text-ink-primary shadow-sm"><IconX className="h-4 w-4" /></button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-secondary">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised shadow-sm"><IconUpload className="h-5 w-5" /></span>
                <span className="text-sm font-medium">{uploading ? "Uploading…" : "Upload a photo"}</span>
                <span className="text-xs text-ink-faint">Cropped to 4:3 and compressed automatically</span>
              </button>
            )}
            {uploading && img && <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm font-medium">Uploading…</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0])} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" className="col-span-2">
            <input className={`${inputClass} w-full`} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Iced Americano" maxLength={80} />
          </Field>
          <Field label="Price (Rs)">
            <input className={`${inputClass} w-full tabular`} inputMode="decimal" value={d.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))} placeholder="250" />
          </Field>
          <Field label="Category">
            <select className={`${inputClass} w-full`} value={d.categoryId} onChange={(e) => set("categoryId", Number(e.target.value))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.depth ? `${c.path}` : c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Description" hint={`${d.description.length}/200 · shown on the QR menu`} className="col-span-2">
            <textarea className={`${inputClass} w-full min-h-20 py-2.5`} value={d.description} maxLength={200} onChange={(e) => set("description", e.target.value)} placeholder="Double shot over ice, with a hint of caramel" />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-primary">Prepared at</p>
          <div className="inline-flex rounded-lg bg-surface-sunken p-0.5">
            {STATIONS.map((s) => (
              <button key={s.value} type="button" onClick={() => set("station", s.value)} className={`rounded-md px-4 py-2 text-sm font-medium transition ${d.station === s.value ? "bg-surface-raised text-ink-primary shadow-sm" : "text-ink-secondary"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-faint">Decides which kitchen screen shows this item.</p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-primary">Tags</p>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => {
              const on = d.tags.includes(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("tags", on ? d.tags.filter((x) => x !== t.value) : d.tags.length < 4 ? [...d.tags, t.value] : d.tags)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle text-ink-secondary hover:border-border-strong"}`}
                >
                  {t.emoji} {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Options */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-primary">Options</p>
              <p className="text-xs text-ink-faint">Extra shot, oat milk, large size… Use 0 for free options, negative for cheaper.</p>
            </div>
            <Button size="small" variant="secondary" icon={<IconPlus />} onClick={() => setModifiers((m) => [...m, { name: "", priceDelta: "0" }])}>Add</Button>
          </div>
          <div className="space-y-2">
            {modifiers.map((m, i) => (
              <div key={m.id ?? `new-${i}`} className="flex gap-2">
                <input className={`${inputClass} w-full`} value={m.name} placeholder="Option name" onChange={(e) => setModifiers((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={`${inputClass} tabular w-28`} inputMode="decimal" value={m.priceDelta} onChange={(e) => setModifiers((l) => l.map((x, j) => (j === i ? { ...x, priceDelta: e.target.value.replace(/[^\d.-]/g, "") } : x)))} aria-label="Extra price" />
                <button type="button" aria-label="Remove option" className="rounded-lg px-2 text-ink-faint hover:text-status-danger-ink" onClick={() => {
                  if (m.id) setRemovedMods((r) => [...r, m.id!]);
                  setModifiers((l) => l.filter((_, j) => j !== i));
                }}>
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Cost & recipe */}
        <div className="rounded-xl border border-border-subtle p-4">
          <p className="text-sm font-medium text-ink-primary">Cost & margin</p>
          <p className="mb-3 text-xs text-ink-faint">Optional. Powers the profit report.</p>
          {inventoryOn && stockItems.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Recipe — deducted from stock when paid</p>
              {recipe.map((r, i) => {
                const s = stockItems.find((x) => x.id === r.stockItemId);
                return (
                  <div key={i} className="flex gap-2">
                    <select className={`${inputClass} w-full`} value={r.stockItemId} onChange={(e) => setRecipe((l) => l.map((x, j) => (j === i ? { ...x, stockItemId: Number(e.target.value) } : x)))}>
                      <option value="">Choose stock item</option>
                      {stockItems.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                    </select>
                    <input className={`${inputClass} tabular w-24`} inputMode="decimal" placeholder="Qty" value={r.quantity} onChange={(e) => setRecipe((l) => l.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/[^\d.]/g, "") } : x)))} />
                    <span className="flex w-10 items-center text-xs text-ink-faint">{s?.unit}</span>
                    <button type="button" aria-label="Remove" className="px-1 text-ink-faint hover:text-status-danger-ink" onClick={() => setRecipe((l) => l.filter((_, j) => j !== i))}><IconTrash className="h-4 w-4" /></button>
                  </div>
                );
              })}
              <button type="button" className="text-sm font-medium text-brand-strong" onClick={() => setRecipe((l) => [...l, { stockItemId: "", quantity: "" }])}>+ Add ingredient</button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-4">
            {recipeCost === 0 && (
              <Field label="Cost price (Rs)" className="w-40">
                <input className={`${inputClass} w-full tabular`} inputMode="decimal" value={d.costPrice} onChange={(e) => set("costPrice", e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 90" />
              </Field>
            )}
            {effectiveCost > 0 && (
              <div className="pb-2 text-sm text-ink-secondary">
                Cost <span className="tabular font-medium text-ink-primary">{rs(effectiveCost)}</span>
                {margin != null && <> · Margin <Pill tone={margin >= 60 ? "success" : margin >= 35 ? "warning" : "danger"}>{margin.toFixed(0)}%</Pill></>}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border-subtle p-4">
          <Switch checked={d.isAvailable} onChange={(v) => set("isAvailable", v)} label="Available" description="Turn off to show it as Sold out everywhere." />
          <Switch checked={d.trackStock} onChange={(v) => set("trackStock", v)} label="Count portions" description="For ready-made items (cans, bottles, cakes) — stops waiters selling more than you have." />
          {d.trackStock && (
            <div className="grid grid-cols-2 gap-4">
              {!d.id && (
                <Field label="In stock now">
                  <input className={`${inputClass} w-full tabular`} inputMode="numeric" value={d.stockQuantity} onChange={(e) => set("stockQuantity", e.target.value.replace(/\D/g, ""))} />
                </Field>
              )}
              <Field label="Warn when below">
                <input className={`${inputClass} w-full tabular`} inputMode="numeric" value={d.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value.replace(/\D/g, ""))} />
              </Field>
              {d.id && item && <Restock item={item} onDone={(m) => onSaved(m)} onError={onError} />}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Restock({ item, onDone, onError }: { item: AdminMenuItem; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply(sign: 1 | -1) {
    const n = Number(qty);
    if (!n) return;
    setBusy(true);
    try {
      await apiFetchJson(`/menu/${item.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: sign * n }),
      });
      onDone(sign > 0 ? `Added ${n} to ${item.name}` : `Removed ${n} from ${item.name}`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="col-span-2">
      <p className="mb-1.5 text-sm font-medium text-ink-primary">{item.stockQuantity} left · adjust</p>
      <div className="flex gap-2">
        <input className={`${inputClass} tabular w-28`} inputMode="numeric" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
        <Button variant="secondary" disabled={busy || !qty} onClick={() => apply(1)}>+ Restock</Button>
        <Button variant="ghost" disabled={busy || !qty} onClick={() => apply(-1)}>− Remove</Button>
      </div>
    </div>
  );
}
