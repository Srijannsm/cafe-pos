"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetchJson } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { Button } from "../../../../components/ui/Button";
import { Modal } from "../../../../components/ui/Modal";
import { Switch } from "../../../../components/ui/Switch";
import { Field, Panel, inputClass } from "../../../../components/ui/Field";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { IconPlus, IconGrip, IconEdit, IconTrash, IconChevronRight } from "../../../../components/icons";
import type { Category } from "../../../../lib/menu-types";

// Two levels only: Category -> Sub-category (Drinks -> Hot / Cold / Shakes).
// On the waiter screen sub-categories show as a second chip row, so a deeper
// tree would just mean more taps.
export default function CategoriesPage() {
  const { showToast, toastHost } = useToast();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ id?: number; name: string; parentId: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const drag = useRef<{ id: number; parentId: number | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setCats(await apiFetchJson<Category[]>("/menu/categories"));
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const top = useMemo(() => cats.filter((c) => c.parentId == null).sort((a, b) => a.sortOrder - b.sortOrder), [cats]);
  const childrenOf = (id: number) => cats.filter((c) => c.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder);
  const json = { "Content-Type": "application/json" };

  async function save() {
    if (!form?.name.trim()) return;
    setSaving(true);
    try {
      if (form.id) {
        await apiFetchJson(`/menu/categories/${form.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ name: form.name, parentId: form.parentId }) });
      } else {
        await apiFetchJson("/menu/categories", { method: "POST", headers: json, body: JSON.stringify({ name: form.name, parentId: form.parentId }) });
      }
      showToast(form.id ? "Category updated" : "Category added");
      setForm(null);
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Category, isActive: boolean) {
    setCats((l) => l.map((x) => (x.id === c.id ? { ...x, isActive } : x)));
    try {
      await apiFetchJson(`/menu/categories/${c.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ isActive }) });
    } catch (e) {
      showToast((e as Error).message, "error");
      load();
    }
  }

  async function drop(target: Category) {
    const from = drag.current;
    drag.current = null;
    if (!from || from.id === target.id || from.parentId !== target.parentId) return;
    const siblings = (target.parentId == null ? top : childrenOf(target.parentId)).map((c) => c.id);
    siblings.splice(siblings.indexOf(target.id), 0, siblings.splice(siblings.indexOf(from.id), 1)[0]!);
    setCats((l) => l.map((c) => (siblings.includes(c.id) ? { ...c, sortOrder: siblings.indexOf(c.id) } : c)));
    try {
      await apiFetchJson("/menu/reorder", { method: "PATCH", headers: json, body: JSON.stringify({ kind: "category", ids: siblings }) });
    } catch (e) {
      showToast((e as Error).message, "error");
      load();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await apiFetchJson(`/menu/categories/${deleting.id}`, { method: "DELETE" });
      showToast("Category deleted");
      setDeleting(null);
      load();
    } catch (e) {
      showToast((e as Error).message, "error");
      setDeleting(null);
    }
  }

  function Row({ c, depth }: { c: Category; depth: number }) {
    return (
      <div
        draggable
        onDragStart={() => (drag.current = { id: c.id, parentId: c.parentId })}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => drop(c)}
        className={`flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0 ${depth ? "bg-surface-canvas/60 pl-12" : ""} ${c.isActive ? "" : "opacity-60"}`}
      >
        <IconGrip className="h-4 w-4 cursor-grab text-ink-faint" />
        {depth > 0 && <IconChevronRight className="h-3.5 w-3.5 text-ink-faint" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-primary">{c.name}</p>
          <p className="text-xs text-ink-faint">
            {c.itemCount ?? 0} items
            {depth === 0 && childrenOf(c.id).length > 0 && ` · ${childrenOf(c.id).length} sub-categories`}
          </p>
        </div>
        {depth === 0 && (
          <Button size="small" variant="ghost" icon={<IconPlus />} onClick={() => setForm({ name: "", parentId: c.id })}>
            Sub-category
          </Button>
        )}
        <Switch size="sm" checked={c.isActive} onChange={(v) => toggle(c, v)} label={`${c.name} visible`} />
        <button type="button" aria-label="Edit" className="rounded-lg p-2 text-ink-faint hover:bg-surface-sunken hover:text-ink-primary" onClick={() => setForm({ id: c.id, name: c.name, parentId: c.parentId })}>
          <IconEdit className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Delete" className="rounded-lg p-2 text-ink-faint hover:bg-status-danger-tint hover:text-status-danger-ink" onClick={() => setDeleting(c)}>
          <IconTrash className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {toastHost}
      <PageHeader
        title="Categories"
        description="Drag to set the order waiters and customers see. Hidden categories disappear from both."
        actions={<Button icon={<IconPlus />} onClick={() => setForm({ name: "", parentId: null })}>Add category</Button>}
      />
      <Panel padded={false}>
        {loading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : top.length === 0 ? (
          <EmptyState title="No categories yet" description="Try Coffee, Tea, Momo, Snacks, Hookah." className="py-14" action={<Button onClick={() => setForm({ name: "", parentId: null })}>Add the first one</Button>} />
        ) : (
          top.map((c) => (
            <div key={c.id}>
              <Row c={c} depth={0} />
              {childrenOf(c.id).map((s) => <Row key={s.id} c={s} depth={1} />)}
            </div>
          ))
        )}
      </Panel>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit category" : form?.parentId ? "New sub-category" : "New category"} size="sm">
        {form && (
          <div className="space-y-4">
            <Field label="Name">
              <input autoFocus className={`${inputClass} w-full`} value={form.name} maxLength={50} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="e.g. Cold drinks" />
            </Field>
            <Field label="Inside" hint="Leave as top level for a main category.">
              <select className={`${inputClass} w-full`} value={form.parentId ?? ""} onChange={(e) => setForm({ ...form, parentId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— Top level —</option>
                {top.filter((t) => t.id !== form.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
              <Button onClick={save} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="Only empty categories can be deleted. Hide it instead if it still has items."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
