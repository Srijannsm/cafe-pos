"use client";

import { useEffect, useState } from "react";
import { Sheet, Stepper } from "../ui/Sheet";
import { assetUrl, rs } from "../../lib/format";
import { TAGS } from "../../lib/menu-types";

export type SheetItem = {
  id: number;
  name: string;
  price: string;
  description?: string | null;
  imageUrl?: string | null;
  tags?: string[];
  modifiers: { id: number; name: string; priceDelta: string }[];
  maxQty?: number;
};

const QUICK_NOTES = ["Less sugar", "No sugar", "Extra hot", "Less spicy", "No onion", "Takeaway"];

// One item -> choose options, quantity and a kitchen note -> add.
// Shared by the waiter screen and the customer QR menu so both behave the same.
export function ItemSheet({ item, onClose, onAdd, busy, addLabel = "Add", footerExtra }: {
  item: SheetItem | null;
  onClose: () => void;
  onAdd: (p: { qty: number; modifierIds: number[]; note: string }) => void;
  busy?: boolean;
  addLabel?: string;
  footerExtra?: React.ReactNode;
}) {
  const [qty, setQty] = useState(1);
  const [mods, setMods] = useState<number[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => {
    setQty(1);
    setMods([]);
    setNote("");
  }, [item?.id]);
  if (!item) return null;

  const unit = Number(item.price) + item.modifiers.filter((m) => mods.includes(m.id)).reduce((s, m) => s + Number(m.priceDelta), 0);
  const img = assetUrl(item.imageUrl);

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <Stepper value={qty} onChange={setQty} max={item.maxQty ?? 20} />
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdd({ qty, modifierIds: mods, note: note.trim() })}
            className="flex min-h-12 flex-1 items-center justify-between rounded-full bg-brand px-5 text-base font-semibold text-on-brand shadow-sm transition active:scale-[0.98] disabled:opacity-60"
          >
            <span>{busy ? "Adding…" : addLabel}</span>
            <span className="tabular">{rs(unit * qty)}</span>
          </button>
        </div>
      }
    >
      {img && <img src={img} alt="" className="aspect-[4/3] w-full object-cover" />}
      <div className="space-y-5 p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-ink-primary">{item.name}</h2>
            <p className="tabular shrink-0 text-lg font-semibold">{rs(item.price)}</p>
          </div>
          {!!item.tags?.length && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {item.tags.map((t) => {
                const tag = TAGS.find((x) => x.value === t);
                return tag ? <span key={t} className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-secondary">{tag.emoji} {tag.label}</span> : null;
              })}
            </div>
          )}
          {item.description && <p className="mt-2 text-sm text-ink-secondary">{item.description}</p>}
        </div>

        {item.modifiers.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-primary">Options <span className="font-normal text-ink-faint">· optional</span></p>
            <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle">
              {item.modifiers.map((m) => {
                const on = mods.includes(m.id);
                return (
                  <label key={m.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-4">
                    <input type="checkbox" checked={on} onChange={() => setMods((x) => (on ? x.filter((i) => i !== m.id) : [...x, m.id]))} className="h-5 w-5 rounded accent-[var(--brand)]" />
                    <span className="flex-1 text-sm text-ink-primary">{m.name}</span>
                    {Number(m.priceDelta) !== 0 && <span className="tabular text-sm text-ink-secondary">{Number(m.priceDelta) > 0 ? "+" : "−"}{rs(Math.abs(Number(m.priceDelta)))}</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-ink-primary">Note for the kitchen</p>
          <div className="no-scrollbar -mx-5 mb-2 flex gap-2 overflow-x-auto px-5">
            {QUICK_NOTES.map((q) => (
              <button key={q} type="button" onClick={() => setNote((n) => (n.includes(q) ? n : n ? `${n}, ${q.toLowerCase()}` : q))} className="shrink-0 rounded-full border border-border-subtle px-3 py-1.5 text-xs text-ink-secondary active:bg-surface-sunken">
                {q}
              </button>
            ))}
          </div>
          <input value={note} maxLength={150} onChange={(e) => setNote(e.target.value)} placeholder="Anything special?" className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-raised px-4 text-sm outline-none focus:border-brand" />
        </div>
        {footerExtra}
      </div>
    </Sheet>
  );
}
