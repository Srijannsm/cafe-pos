"use client";

import { useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorState } from "../../../components/ui/ErrorState";
import { IconUsers, IconClipboardList, IconTable, IconAlert } from "../../../components/icons";

const STATUS_STYLES: Record<string, string> = {
  trial:     "bg-blue-50 text-blue-700",
  active:    "bg-status-success-tint text-status-success-ink",
  overdue:   "bg-yellow-50 text-yellow-700",
  cancelled: "bg-surface-sunken text-ink-faint",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NP", {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ─── Usage Meter ──────────────────────────────────────────────────────────────

function UsageMeter({
  label,
  icon: Icon,
  used,
  max,
}: {
  label: string;
  icon: React.FC<{ className?: string }>;
  used: number;
  max: number | null;
}) {
  const isUnlimited = max === null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / max!) * 100));
  const isFull = !isUnlimited && pct >= 100;
  const isHigh = !isUnlimited && pct >= 80 && !isFull;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-ink-faint" />
          <span className="text-sm text-ink-secondary">{label}</span>
        </div>
        <span className={`text-xs font-semibold ${isFull ? "text-red-600" : isHigh ? "text-yellow-600" : "text-ink-primary"}`}>
          {isUnlimited ? `${used} / ∞` : `${used} / ${max}`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        {isUnlimited ? (
          <div className="h-full w-full rounded-full bg-brand/20" />
        ) : (
          <div
            className={`h-full rounded-full transition-all ${isFull ? "bg-red-500" : isHigh ? "bg-yellow-400" : "bg-brand"}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PlanRow = {
  key: string; name: string; description: string | null; monthlyPrice: number; yearlyMonths: number;
  maxStaff: number | null; maxMenuItems: number | null; maxTables: number | null;
  qrOrdering: boolean; reports: boolean; inventory: boolean; tableGame: boolean;
};
type MyPlan = {
  plan: string; planName: string; billingCycle: string; price: number; subscriptionStatus: "trial" | "active" | "overdue" | "cancelled";
  nextBillingAt: string | null; trialEndsAt: string; isOverdue: boolean;
  features: { qrOrdering: boolean; reports: boolean; inventory: boolean; tableGame: boolean; maxStaff: number | null; maxMenuItems: number | null; maxTables: number | null };
  usage: { staffCount: number; menuItemCount: number; tableCount: number };
  plans: PlanRow[];
};

const FEATURE_ROWS: { key: "qrOrdering" | "reports" | "inventory" | "tableGame"; label: string }[] = [
  { key: "qrOrdering", label: "QR self-ordering" },
  { key: "reports", label: "Reports & analytics" },
  { key: "inventory", label: "Inventory & recipes" },
  { key: "tableGame", label: "Customer table game" },
];

// Prices, limits and features come from the platform's editable plans
// (/platform/plans) via GET /cafes/my-plan -- nothing here is hardcoded.
export default function PlanPage() {
  const [info, setInfo] = useState<MyPlan | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetchJson<MyPlan>("/cafes/my-plan").then(setInfo).catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div>
        <PageHeader title="Plan" description="Your subscription, usage and what's included." />
        <ErrorState title="Couldn't load your plan" description="Please refresh the page or contact your platform administrator." />
      </div>
    );
  }
  if (!info) {
    return (
      <div className="space-y-4">
        <PageHeader title="Plan" description="Your subscription, usage and what's included." />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  const trial = info.subscriptionStatus === "trial";
  const trialLeft = Math.ceil((new Date(info.trialEndsAt).getTime() - Date.now()) / 86400000);
  const limit = (n: number | null) => (n == null ? "Unlimited" : n.toLocaleString("en-IN"));

  return (
    <div className="space-y-6">
      <PageHeader title="Plan" description="Your subscription, usage and what's included." />

      {info.isOverdue && (
        <div className="flex items-start gap-3 rounded-2xl border border-status-warning/40 bg-status-warning-tint px-5 py-4 text-status-warning-ink">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Your subscription payment is overdue</p>
            <p className="mt-0.5 text-sm">The app is read-only for new orders until payment is received. Contact your platform administrator.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border-subtle bg-surface-raised p-6 lg:col-span-2">
          <p className="text-sm text-ink-secondary">Current plan</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-2xl font-semibold">{trial ? "Free trial" : info.planName}</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[info.subscriptionStatus]}`}>{info.subscriptionStatus}</span>
          </div>
          <p className="mt-1 text-sm text-ink-secondary">
            {trial
              ? `Everything unlocked · ${trialLeft > 0 ? `${trialLeft} day${trialLeft === 1 ? "" : "s"} left` : "trial ended"} · then ${info.planName} at Rs ${info.price.toLocaleString("en-IN")}/${info.billingCycle === "yearly" ? "year" : "month"}`
              : `Rs ${info.price.toLocaleString("en-IN")} / ${info.billingCycle === "yearly" ? "year" : "month"}`}
            {info.nextBillingAt && !trial ? ` · next bill ${formatDate(info.nextBillingAt)}` : ""}
          </p>
          <div className="mt-6 space-y-5">
            <UsageMeter label="Staff accounts" icon={IconUsers} used={info.usage.staffCount} max={info.features.maxStaff} />
            <UsageMeter label="Menu items" icon={IconClipboardList} used={info.usage.menuItemCount} max={info.features.maxMenuItems} />
            <UsageMeter label="Tables" icon={IconTable} used={info.usage.tableCount} max={info.features.maxTables} />
          </div>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-surface-raised p-6">
          <p className="mb-4 text-sm font-semibold">Included{trial ? " during your trial" : ""}</p>
          <ul className="space-y-3 text-sm">
            {["Waiter app & kitchen display", "Billing, receipts & cash drawer", "Menu, tables & QR codes"].map((l) => (
              <li key={l} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-status-success" />{l}</li>
            ))}
            {FEATURE_ROWS.map((f) => (
              <li key={f.key} className={`flex items-center gap-2 ${info.features[f.key] ? "" : "text-ink-faint line-through"}`}>
                <span className={`h-2 w-2 rounded-full ${info.features[f.key] ? "bg-status-success" : "bg-border-strong"}`} />{f.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Compare plans */}
      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface-raised">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-5 py-4 text-left font-medium text-ink-faint">Compare plans</th>
              {info.plans.map((p) => (
                <th key={p.key} className={`px-5 py-4 text-left ${p.key === info.plan ? "bg-brand-tint" : ""}`}>
                  <p className="font-semibold">{p.name}{p.key === info.plan && <span className="ml-2 text-xs font-medium text-brand-strong">{trial ? "after trial" : "current"}</span>}</p>
                  <p className="tabular font-normal text-ink-secondary">Rs {p.monthlyPrice.toLocaleString("en-IN")}/mo</p>
                  {p.description && <p className="mt-1 text-xs font-normal text-ink-faint">{p.description}</p>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([["maxStaff", "Staff accounts"], ["maxMenuItems", "Menu items"], ["maxTables", "Tables"]] as const).map(([k, l]) => (
              <tr key={k} className="border-b border-border-subtle">
                <td className="px-5 py-3 text-ink-secondary">{l}</td>
                {info.plans.map((p) => <td key={p.key} className={`tabular px-5 py-3 ${p.key === info.plan ? "bg-brand-tint/50" : ""}`}>{limit(p[k])}</td>)}
              </tr>
            ))}
            {FEATURE_ROWS.map((f) => (
              <tr key={f.key} className="border-b border-border-subtle last:border-0">
                <td className="px-5 py-3 text-ink-secondary">{f.label}</td>
                {info.plans.map((p) => <td key={p.key} className={`px-5 py-3 ${p.key === info.plan ? "bg-brand-tint/50" : ""}`}>{p[f.key] ? "✓" : <span className="text-ink-faint">—</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-border-subtle px-5 py-3 text-xs text-ink-faint">To change plan, contact your platform administrator.</p>
      </div>

    </div>
  );
}
