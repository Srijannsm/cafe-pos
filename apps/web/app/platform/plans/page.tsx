"use client";

import { useEffect, useState } from "react";
import { platformFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Switch } from "../../../components/ui/Switch";
import { Field, Panel, inputClass } from "../../../components/ui/Field";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { PLAN_KEYS, invalidatePlans, type Plan, type PlanConfig } from "../../../components/platform/shared";
import { rs } from "../../../lib/format";

const FEATURES: { key: "qrOrdering" | "reports" | "inventory" | "tableGame"; label: string; hint: string }[] = [
  { key: "qrOrdering", label: "QR self-ordering", hint: "Customers order from the table QR" },
  { key: "reports", label: "Reports", hint: "Sales, items, staff, profit, CSV export" },
  { key: "inventory", label: "Inventory", hint: "Stock, purchases, suppliers, recipes" },
  { key: "tableGame", label: "Table game", hint: "Play-while-you-wait on the QR page" },
];
const LIMITS: { key: "maxStaff" | "maxMenuItems" | "maxTables"; label: string }[] = [
  { key: "maxStaff", label: "Staff accounts" },
  { key: "maxMenuItems", label: "Menu items" },
  { key: "maxTables", label: "Tables" },
];

type Draft = Omit<PlanConfig, "maxStaff" | "maxMenuItems" | "maxTables" | "monthlyPrice"> & {
  monthlyPrice: string; maxStaff: string; maxMenuItems: string; maxTables: string;
};
const toDraft = (p: PlanConfig): Draft => ({
  ...p, monthlyPrice: String(p.monthlyPrice),
  maxStaff: p.maxStaff == null ? "" : String(p.maxStaff),
  maxMenuItems: p.maxMenuItems == null ? "" : String(p.maxMenuItems),
  maxTables: p.maxTables == null ? "" : String(p.maxTables),
});

// Plans are data, not code: what each plan costs and includes is edited
// here and takes effect for every cafe on that plan immediately (the API
// reloads its plan cache on save). Trial cafes get whatever Premium has.
export default function PlansPage() {
  const { showToast, toastHost } = useToast();
  const [plans, setPlans] = useState<PlanConfig[] | null>(null);
  const [drafts, setDrafts] = useState<Record<Plan, Draft> | null>(null);
  const [saving, setSaving] = useState<Plan | null>(null);
  const [confirm, setConfirm] = useState<{ key: Plan; removed: string[] } | null>(null);

  function apply(list: PlanConfig[]) {
    setPlans(list);
    setDrafts(Object.fromEntries(list.map((p) => [p.key, toDraft(p)])) as Record<Plan, Draft>);
  }
  useEffect(() => {
    platformFetchJson<PlanConfig[]>("/platform/plans").then(apply).catch((e) => showToast(e.message, "error"));
  }, [showToast]);

  const set = (k: Plan, patch: Partial<Draft>) => setDrafts((d) => (d ? { ...d, [k]: { ...d[k], ...patch } } : d));
  const dirty = (k: Plan) => {
    const p = plans?.find((x) => x.key === k);
    return !!p && !!drafts && JSON.stringify(toDraft(p)) !== JSON.stringify(drafts[k]);
  };

  function requestSave(k: Plan) {
    const before = plans!.find((p) => p.key === k)!;
    const after = drafts![k];
    // Taking a feature away from cafes that already pay for it deserves a pause.
    const removed = FEATURES.filter((f) => before[f.key] && !after[f.key]).map((f) => f.label);
    if (removed.length && ((before.cafes ?? 0) + (before.trialCafes ?? 0)) > 0) setConfirm({ key: k, removed });
    else save(k);
  }

  async function save(k: Plan) {
    const d = drafts![k];
    const lim = (v: string) => (v.trim() === "" ? null : Number(v));
    setSaving(k);
    try {
      const list = await platformFetchJson<PlanConfig[]>(`/platform/plans/${k}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: d.name, description: d.description ?? "", monthlyPrice: Number(d.monthlyPrice || 0), yearlyMonths: Number(d.yearlyMonths || 12),
          maxStaff: lim(d.maxStaff), maxMenuItems: lim(d.maxMenuItems), maxTables: lim(d.maxTables),
          qrOrdering: d.qrOrdering, reports: d.reports, inventory: d.inventory, tableGame: d.tableGame,
        }),
      });
      apply(list);
      invalidatePlans();
      showToast(`${d.name} plan saved — applies to its cafes now`);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      {toastHost}
      <PageHeader title="Plans" description="Set the price, limits and features of each plan. Changes apply to every cafe on that plan straight away. Cafes on trial get everything Premium has." />
      {!drafts ? (
        <div className="grid gap-6 xl:grid-cols-3">{PLAN_KEYS.map((k) => <Skeleton key={k} className="h-[640px] rounded-2xl" />)}</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {PLAN_KEYS.map((k) => {
            const d = drafts[k];
            const p = plans!.find((x) => x.key === k)!;
            const yearly = Number(d.monthlyPrice || 0) * Number(d.yearlyMonths || 12);
            return (
              <Panel key={k} className={`flex flex-col ${k === "standard" ? "ring-2 ring-brand/30" : ""}`}>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{k}</p>
                    <p className="mt-1 text-sm text-ink-secondary">{p.cafes ?? 0} paying cafe{p.cafes === 1 ? "" : "s"}{p.trialCafes ? ` · ${p.trialCafes} on trial use this` : ""}</p>
                  </div>
                  {dirty(k) && <span className="rounded-full bg-status-warning-tint px-2 py-0.5 text-xs font-medium text-status-warning-ink">Unsaved</span>}
                </div>

                <div className="space-y-4">
                  <Field label="Name"><input className={`${inputClass} w-full`} value={d.name} onChange={(e) => set(k, { name: e.target.value })} /></Field>
                  <Field label="Short description" hint="Shown to cafes when comparing plans">
                    <input className={`${inputClass} w-full`} maxLength={200} value={d.description ?? ""} onChange={(e) => set(k, { description: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Price / month (Rs)">
                      <input className={`${inputClass} tabular w-full`} inputMode="decimal" value={d.monthlyPrice} onChange={(e) => set(k, { monthlyPrice: e.target.value.replace(/[^\d.]/g, "") })} />
                    </Field>
                    <Field label="Yearly = months" hint={`Rs ${yearly.toLocaleString("en-IN")} / year`}>
                      <input className={`${inputClass} tabular w-full`} inputMode="numeric" value={d.yearlyMonths} onChange={(e) => set(k, { yearlyMonths: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                    </Field>
                  </div>
                </div>

                <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-ink-faint">Limits <span className="normal-case tracking-normal">· empty = unlimited</span></p>
                <div className="space-y-2">
                  {LIMITS.map((l) => (
                    <div key={l.key} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-ink-secondary">{l.label}</span>
                      <input className={`${inputClass} tabular w-28 text-right`} inputMode="numeric" placeholder="∞" value={d[l.key]} onChange={(e) => set(k, { [l.key]: e.target.value.replace(/\D/g, "") } as Partial<Draft>)} />
                    </div>
                  ))}
                </div>

                <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-ink-faint">Features</p>
                <div className="space-y-4">
                  {FEATURES.map((f) => (
                    <Switch key={f.key} checked={d[f.key]} onChange={(v) => set(k, { [f.key]: v } as Partial<Draft>)} label={f.label} description={f.hint} />
                  ))}
                </div>
                <p className="mt-4 text-xs text-ink-faint">Always included: waiter app, kitchen display, billing & receipts, cash drawer, tables & QR codes.</p>

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
                  <p className="tabular text-lg font-semibold">{rs(Number(d.monthlyPrice || 0))}<span className="text-sm font-normal text-ink-faint">/mo</span></p>
                  <div className="flex gap-2">
                    {dirty(k) && <Button variant="ghost" size="small" onClick={() => set(k, toDraft(p))}>Reset</Button>}
                    <Button size="small" disabled={!dirty(k) || !d.name.trim()} loading={saving === k} onClick={() => requestSave(k)}>Save</Button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        tone="warning"
        title="Remove features from existing cafes?"
        description={confirm ? `${confirm.removed.join(", ")} will switch off immediately for every cafe on this plan${confirm.key === "premium" ? " (and every cafe on trial)" : ""}. Their data is kept and comes back if you turn it on again.` : ""}
        confirmLabel="Save anyway"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const k = confirm!.key; setConfirm(null); save(k); }}
      />
    </div>
  );
}
