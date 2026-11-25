"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal";
import { Field, Panel, inputClass } from "../../../../components/ui/Field";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { IconPlus, IconEdit, IconPhone } from "../../../../components/icons";
import type { Supplier } from "../../../../components/admin/inventory";

export default function SuppliersPage() {
  const { showToast, toastHost } = useToast();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [form, setForm] = useState<{ id?: number; name: string; phone: string; panNumber: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => apiFetchJson<Supplier[]>("/inventory/suppliers").then(setRows).catch((e) => showToast(e.message, "error")), [showToast]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form?.name.trim()) return;
    setBusy(true);
    try {
      const { id, ...body } = form;
      await apiFetchJson(id ? `/inventory/suppliers/${id}` : "/inventory/suppliers", {
        method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      showToast("Supplier saved");
      setForm(null);
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      {toastHost}
      <PageHeader title="Suppliers" description="Who you buy from — milk man, bakery, hookah shop, wholesaler." actions={<Button icon={<IconPlus />} onClick={() => setForm({ name: "", phone: "", panNumber: "", note: "" })}>Add supplier</Button>} />
      <Panel padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="No suppliers yet" description="They're also added automatically when you type a new name on a purchase." className="py-14" />
        ) : rows.map((s) => (
          <div key={s.id} className="flex items-center gap-4 border-b border-border-subtle px-5 py-4 last:border-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-ink-secondary">{s.name.charAt(0)}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-primary">{s.name}</p>
              <p className="text-sm text-ink-faint">
                {s._count?.purchases ?? 0} purchases{s.panNumber ? ` · PAN ${s.panNumber}` : ""}{s.note ? ` · ${s.note}` : ""}
              </p>
            </div>
            {s.phone && (
              <a href={`tel:${s.phone}`} className="hidden items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm text-ink-secondary hover:bg-surface-sunken sm:flex">
                <IconPhone className="h-4 w-4" /> {s.phone}
              </a>
            )}
            <button type="button" aria-label="Edit" className="rounded-lg p-2 text-ink-faint hover:bg-surface-sunken" onClick={() => setForm({ id: s.id, name: s.name, phone: s.phone ?? "", panNumber: s.panNumber ?? "", note: s.note ?? "" })}>
              <IconEdit className="h-4 w-4" />
            </button>
          </div>
        ))}
      </Panel>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit supplier" : "New supplier"} size="sm">
        {form && (
          <div className="space-y-4">
            <Field label="Name"><input className={`${inputClass} w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Phone"><input className={`${inputClass} w-full`} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="PAN (optional)"><input className={`${inputClass} w-full`} value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value })} /></Field>
            <Field label="Note"><input className={`${inputClass} w-full`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Delivers Tue & Fri" /></Field>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
