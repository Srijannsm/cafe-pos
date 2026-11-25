"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "../../lib/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { IconTrash } from "../icons";
import { localDay, rs } from "../../lib/format";

export type StockItem = {
  id: number;
  name: string;
  kind: "ingredient" | "consumable" | "asset";
  unit: string;
  currentQty: string;
  avgCost: string;
  lowStockThreshold: string;
  isActive: boolean;
  status: "ok" | "low" | "out";
  value: string;
  lastMovementAt: string | null;
  usedInRecipes: number;
};

export type Supplier = { id: number; name: string; phone: string | null; panNumber: string | null; note: string | null; _count?: { purchases: number } };

export const KIND_LABEL = { ingredient: "Ingredient", consumable: "Consumable", asset: "Asset" } as const;
export const KIND_HINT = {
  ingredient: "Used up in recipes — coffee beans, milk, sugar",
  consumable: "Used up per service — hookah coils, foil, napkins, cups",
  asset: "Reused until broken — glasses, plates, cutlery",
} as const;
export const UNITS = ["pcs", "g", "kg", "ml", "L", "pack", "box", "bottle", "dozen"];
const json = { "Content-Type": "application/json" };

export function StockItemModal({ open, item, onClose, onSaved, onError }: {
  open: boolean; item: StockItem | null; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const [f, setF] = useState({ name: "", kind: "ingredient" as StockItem["kind"], unit: "pcs", lowStockThreshold: "", openingQty: "", unitCost: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(item
      ? { name: item.name, kind: item.kind, unit: item.unit, lowStockThreshold: String(Number(item.lowStockThreshold)), openingQty: "", unitCost: "" }
      : { name: "", kind: "ingredient", unit: "pcs", lowStockThreshold: "", openingQty: "", unitCost: "" });
  }, [open, item]);

  async function save() {
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: f.name.trim(), kind: f.kind, unit: f.unit, lowStockThreshold: Number(f.lowStockThreshold || 0) };
      if (!item) {
        if (f.openingQty) body.openingQty = Number(f.openingQty);
        if (f.unitCost) body.unitCost = Number(f.unitCost);
      }
      await apiFetchJson(item ? `/inventory/items/${item.id}` : "/inventory/items", { method: item ? "PATCH" : "POST", headers: json, body: JSON.stringify(body) });
      onSaved(item ? "Stock item updated" : "Stock item added");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? "Edit stock item" : "New stock item"}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2">
          <input className={`${inputClass} w-full`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Hookah coil, Milk, Beer glass" />
        </Field>
        <Field label="Type" hint={KIND_HINT[f.kind]} className="col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(KIND_LABEL) as StockItem["kind"][]).map((k) => (
              <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} className={`rounded-lg border px-3 py-2 text-sm font-medium ${f.kind === k ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle text-ink-secondary"}`}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Unit">
          <select className={`${inputClass} w-full`} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Warn when below">
          <input className={`${inputClass} w-full tabular`} inputMode="decimal" value={f.lowStockThreshold} onChange={(e) => setF({ ...f, lowStockThreshold: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0" />
        </Field>
        {!item && (
          <>
            <Field label="In stock now" hint="Opening balance">
              <input className={`${inputClass} w-full tabular`} inputMode="decimal" value={f.openingQty} onChange={(e) => setF({ ...f, openingQty: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0" />
            </Field>
            <Field label={`Cost per ${f.unit} (Rs)`} hint="Optional">
              <input className={`${inputClass} w-full tabular`} inputMode="decimal" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0" />
            </Field>
          </>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    </Modal>
  );
}

export function StockOutModal({ open, items, preset, onClose, onSaved, onError }: {
  open: boolean; items: StockItem[]; preset?: StockItem | null; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const [type, setType] = useState<"breakage" | "wastage" | "staff_use">("breakage");
  const [itemId, setItemId] = useState<number | "">("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setItemId(preset?.id ?? "");
    setType(preset?.kind === "asset" ? "breakage" : "wastage");
    setQty("");
    setReason("");
  }, [open, preset]);
  const item = items.find((i) => i.id === itemId);

  async function save() {
    if (!itemId || !Number(qty)) return;
    setBusy(true);
    try {
      await apiFetchJson("/inventory/stock-out", { method: "POST", headers: json, body: JSON.stringify({ stockItemId: itemId, type, quantity: Number(qty), reason }) });
      onSaved(`${qty} ${item?.unit ?? ""} ${item?.name ?? ""} recorded`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Stock out">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {([["breakage", "Broken"], ["wastage", "Wasted / expired"], ["staff_use", "Staff use"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setType(v)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${type === v ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle text-ink-secondary"}`}>{l}</button>
          ))}
        </div>
        <Field label="Item">
          <select className={`${inputClass} w-full`} value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
            <option value="">Choose…</option>
            {items.filter((i) => i.isActive).map((i) => <option key={i.id} value={i.id}>{i.name} — {Number(i.currentQty)} {i.unit} left</option>)}
          </select>
        </Field>
        <Field label={`Quantity${item ? ` (${item.unit})` : ""}`}>
          <input className={`${inputClass} w-full tabular`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        <Field label="Note" hint="Who / what happened — shows in the audit log">
          <input className={`${inputClass} w-full`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Dropped by Ram during rush" />
        </Field>
        {item && Number(qty) > 0 && <p className="text-sm text-ink-secondary">Value lost ≈ <span className="tabular font-medium text-ink-primary">{rs(Number(qty) * Number(item.avgCost))}</span></p>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy} disabled={!itemId || !Number(qty)}>Record</Button>
      </div>
    </Modal>
  );
}

type Line = { stockItemId: number | ""; quantity: string; lineTotal: string };

export function PurchaseModal({ open, items, suppliers, onClose, onSaved, onError }: {
  open: boolean; items: StockItem[]; suppliers: Supplier[]; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(localDay());
  const [billRef, setBillRef] = useState("");
  const [lines, setLines] = useState<Line[]>([{ stockItemId: "", quantity: "", lineTotal: "" }]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSupplier("");
    setDate(localDay());
    setBillRef("");
    setLines([{ stockItemId: "", quantity: "", lineTotal: "" }]);
  }, [open]);
  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0), [lines]);

  async function save() {
    const valid = lines.filter((l) => l.stockItemId && Number(l.quantity) > 0);
    if (valid.length === 0) return onError("Add at least one item with a quantity");
    setBusy(true);
    try {
      const existing = suppliers.find((s) => s.name.toLowerCase() === supplier.trim().toLowerCase());
      await apiFetchJson("/inventory/purchases", {
        method: "POST",
        headers: json,
        body: JSON.stringify({
          supplierId: existing?.id,
          supplierName: existing ? undefined : supplier.trim() || undefined,
          purchasedAt: date,
          billRef: billRef || undefined,
          lines: valid.map((l) => ({ stockItemId: l.stockItemId, quantity: Number(l.quantity), lineTotal: Number(l.lineTotal || 0) })),
        }),
      });
      onSaved(`Purchase of ${rs(total)} recorded — stock updated`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Stock in (purchase)" size="lg">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Supplier" hint="Type a new name to add it">
          <input className={`${inputClass} w-full`} list="suppliers-list" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Optional" />
          <datalist id="suppliers-list">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
        <Field label="Date">
          <input type="date" className={`${inputClass} w-full`} value={date} max={localDay()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Bill no.">
          <input className={`${inputClass} w-full`} value={billRef} onChange={(e) => setBillRef(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <div className="mt-5 space-y-2">
        <div className="hidden grid-cols-[1fr_110px_130px_32px] gap-2 text-xs font-medium uppercase tracking-wide text-ink-faint sm:grid">
          <span>Item</span><span>Qty</span><span>Total paid</span><span />
        </div>
        {lines.map((l, i) => {
          const it = items.find((x) => x.id === l.stockItemId);
          const unitCost = Number(l.quantity) > 0 && Number(l.lineTotal) > 0 ? Number(l.lineTotal) / Number(l.quantity) : null;
          const upd = (patch: Partial<Line>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="grid grid-cols-[1fr_90px_110px_32px] items-start gap-2 sm:grid-cols-[1fr_110px_130px_32px]">
              <select className={`${inputClass} w-full`} value={l.stockItemId} onChange={(e) => upd({ stockItemId: Number(e.target.value) })}>
                <option value="">Item…</option>
                {items.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <div>
                <input className={`${inputClass} w-full tabular`} inputMode="decimal" placeholder="Qty" value={l.quantity} onChange={(e) => upd({ quantity: e.target.value.replace(/[^\d.]/g, "") })} />
                {it && <span className="mt-0.5 block text-[11px] text-ink-faint">{it.unit}</span>}
              </div>
              <div>
                <input className={`${inputClass} w-full tabular`} inputMode="decimal" placeholder="Rs" value={l.lineTotal} onChange={(e) => upd({ lineTotal: e.target.value.replace(/[^\d.]/g, "") })} />
                {unitCost != null && it && <span className="mt-0.5 block text-[11px] text-ink-faint">{rs(unitCost, { decimals: true })}/{it.unit}</span>}
              </div>
              <button type="button" aria-label="Remove line" className="mt-3 text-ink-faint hover:text-status-danger-ink" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}>
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <button type="button" className="text-sm font-medium text-brand-strong" onClick={() => setLines((ls) => [...ls, { stockItemId: "", quantity: "", lineTotal: "" }])}>+ Add line</button>
      </div>
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <p className="text-sm text-ink-secondary">Total <span className="tabular ml-1 text-lg font-semibold text-ink-primary">{rs(total)}</span></p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}>Save purchase</Button>
        </div>
      </div>
    </Modal>
  );
}
