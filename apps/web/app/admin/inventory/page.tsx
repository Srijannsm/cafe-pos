"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Tabs } from "../../../components/ui/Tabs";
import { Panel, Pill, inputClass } from "../../../components/ui/Field";
import { StatCard } from "../../../components/ui/StatCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Skeleton } from "../../../components/ui/Skeleton";
import { IconPlus, IconTruck, IconBox, IconSearch, IconEdit, IconCheck, IconAlert, IconBanknote } from "../../../components/icons";
import { KIND_LABEL, PurchaseModal, StockItemModal, StockOutModal, type StockItem, type Supplier } from "../../../components/admin/inventory";
import { num, rs, timeAgo, ago } from "../../../lib/format";

type Filter = "all" | "ingredient" | "consumable" | "asset" | "low";

export default function StockPage() {
  const { showToast, toastHost } = useToast();
  const [items, setItems] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [itemModal, setItemModal] = useState(false);
  const [outFor, setOutFor] = useState<StockItem | null | undefined>(undefined);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [counting, setCounting] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [savingCount, setSavingCount] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, s] = await Promise.all([apiFetchJson<StockItem[]>("/inventory/items"), apiFetchJson<Supplier[]>("/inventory/suppliers")]);
      setItems(i);
      setSuppliers(s);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const done = (m: string) => {
    showToast(m);
    setItemModal(false);
    setOutFor(undefined);
    setPurchaseOpen(false);
    load();
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "low" ? i.status !== "ok" : i.kind === filter))
      .filter((i) => !q || i.name.toLowerCase().includes(q));
  }, [items, filter, search]);

  const lowCount = items.filter((i) => i.isActive && i.status !== "ok").length;
  const totalValue = items.reduce((s, i) => s + Number(i.value), 0);

  async function postCount() {
    const lines = Object.entries(counts).filter(([, v]) => v !== "").map(([id, v]) => ({ stockItemId: Number(id), countedQty: Number(v) }));
    if (lines.length === 0) return setCounting(false);
    setSavingCount(true);
    try {
      const res = await apiFetchJson<{ adjusted: number; variances: { name: string; diff: string; value: string }[] }>("/inventory/counts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }),
      });
      const lost = res.variances.reduce((s, v) => s + Math.min(0, Number(v.value)), 0);
      showToast(res.adjusted ? `Count saved — ${res.adjusted} items adjusted${lost < 0 ? `, ${rs(-lost)} short` : ""}` : "Count matches the system — nothing to adjust");
      setCounting(false);
      setCounts({});
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSavingCount(false);
    }
  }

  return (
    <div>
      {toastHost}
      <PageHeader
        title="Stock"
        description="Raw materials, hookah supplies, glasses, plates — everything the cafe runs on."
        actions={
          counting ? (
            <>
              <Button variant="secondary" onClick={() => { setCounting(false); setCounts({}); }}>Cancel count</Button>
              <Button icon={<IconCheck />} loading={savingCount} onClick={postCount}>Save count</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setCounting(true)} disabled={items.length === 0}>Count stock</Button>
              <Button variant="secondary" onClick={() => setOutFor(null)} disabled={items.length === 0}>− Stock out</Button>
              <Button variant="secondary" icon={<IconTruck />} onClick={() => setPurchaseOpen(true)} disabled={items.length === 0}>Stock in</Button>
              <Button icon={<IconPlus />} onClick={() => { setEditItem(null); setItemModal(true); }}>New item</Button>
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<IconBox />} label="Items tracked" value={items.filter((i) => i.isActive).length} />
        <StatCard icon={<IconAlert />} label="Low or out" value={lowCount} caption={lowCount ? "Reorder soon" : "All good"} captionTone={lowCount ? "warning" : "success"} />
        <StatCard icon={<IconBanknote />} label="Stock value" value={rs(totalValue)} caption="At average purchase cost" />
      </div>

      {counting && (
        <div className="mb-4 rounded-xl border border-status-info/30 bg-status-info-tint px-4 py-3 text-sm text-status-info-ink">
          Enter what is actually on the shelf. Leave blank to skip an item. Differences are saved as a count adjustment and shown in reports.
        </div>
      )}

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: "all", label: "All" },
              { value: "ingredient", label: "Ingredients" },
              { value: "consumable", label: "Consumables" },
              { value: "asset", label: "Assets" },
              { value: "low", label: "Low", count: lowCount },
            ]}
          />
          <div className="relative ml-auto w-full sm:w-64">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input className={`${inputClass} w-full pl-10`} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<IconBox className="h-6 w-6" />}
            title="No stock items yet"
            description="Add what you buy and count: coffee beans, milk, hookah coils, foil, glasses, plates…"
            action={<Button onClick={() => setItemModal(true)}>Add first item</Button>}
            className="py-14"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3">Item</th>
                  <th className="hidden px-4 py-3 md:table-cell">Type</th>
                  <th className="px-4 py-3 text-right">On hand</th>
                  {counting ? <th className="px-4 py-3 text-right">Counted</th> : <th className="hidden px-4 py-3 text-right sm:table-cell">Value</th>}
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Last change</th>
                  {!counting && <th className="w-40 px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id} className={`border-b border-border-subtle last:border-0 ${i.isActive ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-primary">{i.name}</p>
                      {i.usedInRecipes > 0 && <p className="text-xs text-ink-faint">In {i.usedInRecipes} recipe{i.usedInRecipes > 1 ? "s" : ""}</p>}
                    </td>
                    <td className="hidden px-4 py-3 text-ink-secondary md:table-cell">{KIND_LABEL[i.kind]}</td>
                    <td className="tabular px-4 py-3 text-right font-medium text-ink-primary">{num(i.currentQty)} <span className="font-normal text-ink-faint">{i.unit}</span></td>
                    {counting ? (
                      <td className="px-4 py-2 text-right">
                        <input className={`${inputClass} tabular ml-auto w-28 text-right`} inputMode="decimal" placeholder={num(i.currentQty)} value={counts[i.id] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value.replace(/[^\d.]/g, "") }))} />
                      </td>
                    ) : (
                      <td className="tabular hidden px-4 py-3 text-right text-ink-secondary sm:table-cell">{rs(i.value)}</td>
                    )}
                    <td className="px-4 py-3">
                      {i.status === "out" ? <Pill tone="danger">Out</Pill> : i.status === "low" ? <Pill tone="warning">Low</Pill> : <Pill tone="success">OK</Pill>}
                    </td>
                    <td className="hidden px-4 py-3 text-ink-faint lg:table-cell">{i.lastMovementAt ? `${ago(i.lastMovementAt)}` : "—"}</td>
                    {!counting && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="small" variant="ghost" onClick={() => setOutFor(i)}>Stock out</Button>
                          <button type="button" aria-label="Edit" className="rounded-lg p-2 text-ink-faint hover:bg-surface-sunken hover:text-ink-primary" onClick={() => { setEditItem(i); setItemModal(true); }}>
                            <IconEdit className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <StockItemModal open={itemModal} item={editItem} onClose={() => setItemModal(false)} onSaved={done} onError={(m) => showToast(m, "error")} />
      <StockOutModal open={outFor !== undefined} items={items} preset={outFor ?? null} onClose={() => setOutFor(undefined)} onSaved={done} onError={(m) => showToast(m, "error")} />
      <PurchaseModal open={purchaseOpen} items={items} suppliers={suppliers} onClose={() => setPurchaseOpen(false)} onSaved={done} onError={(m) => showToast(m, "error")} />
    </div>
  );
}
