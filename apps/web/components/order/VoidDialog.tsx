"use client";

import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";

const REASONS = ["Customer changed mind", "Entered by mistake", "Took too long", "Spilled / remade", "Out of stock"];

export function VoidDialog({ open, itemName, onClose, onConfirm, busy }: { open: boolean; itemName: string; onClose: () => void; onConfirm: (reason: string) => void; busy?: boolean }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={`Remove ${itemName}?`} size="sm">
      <p className="mb-4 text-sm text-ink-secondary">It already went to the kitchen, so we keep a record. Pick a reason:</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full border px-3 py-1.5 text-sm ${reason === r ? "border-brand bg-brand-tint text-brand-strong" : "border-border-subtle text-ink-secondary"}`}>{r}</button>
        ))}
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Or type a reason" className="min-h-11 w-full rounded-lg border border-border-strong px-3.5 text-sm outline-none focus:border-brand" />
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Keep it</Button>
        <Button variant="danger" disabled={!reason.trim()} loading={busy} onClick={() => onConfirm(reason.trim())}>Remove item</Button>
      </div>
    </Modal>
  );
}
