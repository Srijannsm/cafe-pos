"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "../../lib/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field, inputClass } from "../ui/Field";
import { METHOD_LABEL, dateTime, rs } from "../../lib/format";

export type ShiftSummary = {
  id: number;
  openedAt: string;
  openedBy: string;
  closedAt: string | null;
  closedBy: string | null;
  openingCash: string;
  cashSales: string;
  totalSales: string;
  salesByMethod: Record<string, string>;
  billsPaid: number;
  payIns: string;
  payOuts: string;
  expectedCash: string;
  countedCash: string | null;
  difference: string | null;
  note: string | null;
  movements: { id: number; type: string; category: string | null; amount: string; note: string | null; createdAt: string }[];
};

export const EXPENSE_CATEGORIES = ["Milk & dairy", "Vegetables", "Gas", "Hookah supplies", "Cleaning", "Staff food", "Repairs", "Delivery", "Rent & bills", "Other"];
const NOTES = [1000, 500, 100, 50, 20, 10, 5, 2, 1];
const json = { "Content-Type": "application/json" };

/** Count the drawer by notes -- how cashiers in Nepal actually count. */
export function DenominationCounter({ onTotal }: { onTotal: (n: number) => void }) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const total = useMemo(() => NOTES.reduce((s, n) => s + n * Number(counts[n] || 0), 0), [counts]);
  useEffect(() => onTotal(total), [total, onTotal]);
  return (
    <div className="grid grid-cols-3 gap-2">
      {NOTES.map((n) => (
        <label key={n} className="flex items-center gap-2 rounded-lg border border-border-subtle px-2.5 py-1.5">
          <span className="tabular w-12 text-sm font-medium text-ink-secondary">Rs {n}</span>
          <span className="text-ink-faint">×</span>
          <input inputMode="numeric" className="tabular w-full bg-transparent text-right text-sm text-ink-primary outline-none" placeholder="0" value={counts[n] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [n]: e.target.value.replace(/\D/g, "") }))} />
        </label>
      ))}
    </div>
  );
}

export function OpenShiftModal({ open, onClose, onDone, onError }: { open: boolean; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setAmount(""); }, [open]);
  async function go() {
    setBusy(true);
    try {
      await apiFetchJson("/shifts/open", { method: "POST", headers: json, body: JSON.stringify({ openingCash: Number(amount || 0) }) });
      onDone();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Open the cash drawer" size="sm">
      <p className="mb-4 text-sm text-ink-secondary">Count the change already in the drawer before the first sale.</p>
      <Field label="Opening cash (Rs)">
        <input autoFocus className={`${inputClass} w-full tabular text-lg`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" onKeyDown={(e) => e.key === "Enter" && go()} />
      </Field>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={go} loading={busy}>Open shift</Button>
      </div>
    </Modal>
  );
}

export function CashMoveModal({ open, initialType, onClose, onDone, onError }: {
  open: boolean; initialType: "pay_in" | "pay_out" | "expense"; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void;
}) {
  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]!);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setAmount("");
    setNote("");
  }, [open, initialType]);

  async function go() {
    if (!Number(amount)) return;
    setBusy(true);
    try {
      await apiFetchJson("/shifts/cash", {
        method: "POST", headers: json,
        body: JSON.stringify({ type, amount: Number(amount), category: type === "pay_in" ? undefined : category, note }),
      });
      onDone(type === "pay_in" ? `${rs(amount)} added to drawer` : `${rs(amount)} ${type === "expense" ? "expense" : "paid out"} recorded`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cash in / out" size="sm">
      <div className="mb-4 grid grid-cols-3 gap-2">
        {([["expense", "Expense"], ["pay_out", "Pay out"], ["pay_in", "Cash in"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setType(v)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${type === v ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle text-ink-secondary"}`}>{l}</button>
        ))}
      </div>
      <p className="mb-4 text-xs text-ink-faint">
        {type === "expense" ? "Money spent on the cafe (milk delivery, gas…). Taken from the drawer if a shift is open." : type === "pay_out" ? "Cash taken out of the drawer (owner withdrawal, change run)." : "Cash added to the drawer (extra change)."}
      </p>
      <div className="space-y-4">
        <Field label="Amount (Rs)">
          <input autoFocus className={`${inputClass} w-full tabular text-lg`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        {type !== "pay_in" && (
          <Field label="Category">
            <select className={`${inputClass} w-full`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        )}
        <Field label="Note"><input className={`${inputClass} w-full`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={go} loading={busy} disabled={!Number(amount)}>Save</Button>
      </div>
    </Modal>
  );
}

export function CloseShiftModal({ open, shift, onClose, onDone, onError }: {
  open: boolean; shift: ShiftSummary | null; onClose: () => void; onDone: (s: ShiftSummary) => void; onError: (m: string) => void;
}) {
  const [counted, setCounted] = useState(0);
  const [manual, setManual] = useState("");
  const [useNotes, setUseNotes] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setManual(""); setNote(""); setUseNotes(true); } }, [open]);
  const value = useNotes ? counted : Number(manual || 0);
  const diff = shift ? value - Number(shift.expectedCash) : 0;

  async function go() {
    setBusy(true);
    try {
      const s = await apiFetchJson<ShiftSummary>("/shifts/close", { method: "POST", headers: json, body: JSON.stringify({ countedCash: value, note }) });
      onDone(s);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Close shift & count cash" size="lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-secondary">Count every note in the drawer.</p>
        <button type="button" className="text-sm font-medium text-brand-strong" onClick={() => setUseNotes((u) => !u)}>{useNotes ? "Type total instead" : "Count by notes"}</button>
      </div>
      {useNotes ? <DenominationCounter onTotal={setCounted} /> : (
        <input className={`${inputClass} w-full tabular text-lg`} inputMode="decimal" placeholder="Total cash counted" value={manual} onChange={(e) => setManual(e.target.value.replace(/[^\d.]/g, ""))} />
      )}
      {shift && (
        <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-surface-canvas p-4 text-center">
          <div><p className="text-xs text-ink-faint">Expected</p><p className="tabular text-lg font-semibold">{rs(shift.expectedCash)}</p></div>
          <div><p className="text-xs text-ink-faint">Counted</p><p className="tabular text-lg font-semibold">{rs(value)}</p></div>
          <div>
            <p className="text-xs text-ink-faint">Difference</p>
            <p className={`tabular text-lg font-semibold ${Math.abs(diff) < 1 ? "text-status-success-ink" : diff < 0 ? "text-status-danger-ink" : "text-status-warning-ink"}`}>
              {diff > 0 ? "+" : ""}{rs(diff)}
            </p>
          </div>
        </div>
      )}
      <Field label="Note" className="mt-4"><input className={`${inputClass} w-full`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={Math.abs(diff) >= 1 ? "Why is it different?" : "Optional"} /></Field>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={go} loading={busy}>Close shift</Button>
      </div>
    </Modal>
  );
}

/** Printable Z-report (end of day) -- fits an 80mm receipt printer. */
export function ZReport({ s, cafeName }: { s: ShiftSummary; cafeName: string }) {
  const row = (l: string, v: string, strong = false) => (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}><span>{l}</span><span className="tabular">{v}</span></div>
  );
  return (
    <div className="receipt-print mx-auto w-full max-w-[320px] space-y-2 rounded-xl border border-border-subtle bg-white p-4 text-[13px] text-black">
      <p className="text-center text-base font-semibold">{cafeName}</p>
      <p className="text-center text-xs">SHIFT REPORT (Z) #{s.id}</p>
      <div className="border-t border-dashed border-black/40 pt-2">
        {row("Opened", `${dateTime(s.openedAt)} · ${s.openedBy}`)}
        {s.closedAt && row("Closed", `${dateTime(s.closedAt)} · ${s.closedBy ?? ""}`)}
      </div>
      <div className="border-t border-dashed border-black/40 pt-2">
        {row("Bills paid", String(s.billsPaid))}
        {Object.entries(s.salesByMethod).map(([m, v]) => row(METHOD_LABEL[m] ?? m, rs(v)))}
        {row("Total sales", rs(s.totalSales), true)}
      </div>
      <div className="border-t border-dashed border-black/40 pt-2">
        {row("Opening cash", rs(s.openingCash))}
        {row("+ Cash sales", rs(s.cashSales))}
        {row("+ Cash in", rs(s.payIns))}
        {row("− Paid out / expenses", rs(s.payOuts))}
        {row("Expected in drawer", rs(s.expectedCash), true)}
        {s.countedCash != null && row("Counted", rs(s.countedCash), true)}
        {s.difference != null && row("Difference", rs(s.difference), true)}
      </div>
      {s.note && <p className="border-t border-dashed border-black/40 pt-2 text-xs">Note: {s.note}</p>}
    </div>
  );
}
