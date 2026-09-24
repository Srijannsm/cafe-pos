"use client";

import { useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorState } from "../../../components/ui/ErrorState";
import {
  IconBanknote,
  IconUsers,
  IconClipboardList,
  IconTable,
  IconBarChart,
  IconAlert,
  IconReceipt,
} from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";

type PlanInfo = {
  plan: "starter" | "standard" | "premium" | "trial";
  subscriptionStatus: "trial" | "active" | "overdue" | "cancelled";
  nextBillingAt: string | null;
  isOverdue: boolean;
  features: {
    qrOrdering: boolean;
    reports: boolean;
    maxStaff: number | null;
    maxMenuItems: number | null;
    maxTables: number | null;
  };
  usage?: {
    staffCount: number;
    menuItemCount: number;
    tableCount: number;
  };
};

const PLAN_DISPLAY: Record<string, { label: string; price: string; colorClass: string }> = {
  starter:  { label: "Starter",  price: "Rs. 999/mo",   colorClass: "text-ink-secondary" },
  standard: { label: "Standard", price: "Rs. 1,999/mo", colorClass: "text-blue-600" },
  premium:  { label: "Premium",  price: "Rs. 3,499/mo", colorClass: "text-amber-600" },
  trial:    { label: "Trial",    price: "Free",         colorClass: "text-brand" },
};

const STATUS_STYLES: Record<string, string> = {
  trial:     "bg-blue-50 text-blue-700",
  active:    "bg-status-success-tint text-status-success-ink",
  overdue:   "bg-yellow-50 text-yellow-700",
  cancelled: "bg-surface-sunken text-ink-faint",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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
          <span className="body-md text-ink-secondary">{label}</span>
        </div>
        <span
          className={`label-sm font-semibold ${
            isFull ? "text-red-600" : isHigh ? "text-yellow-600" : "text-ink-primary"
          }`}
        >
          {isUnlimited ? `${used} / ∞` : `${used} / ${max}`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        {isUnlimited ? (
          <div className="h-full w-full rounded-full bg-brand/20" />
        ) : (
          <div
            className={`h-full rounded-full transition-all ${
              isFull ? "bg-red-500" : isHigh ? "bg-yellow-400" : "bg-brand"
            }`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function FeaturePill({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={`label-sm inline-flex items-center gap-1.5 rounded-pill px-3 py-1 font-medium ${
        enabled
          ? "bg-status-success-tint text-status-success-ink"
          : "bg-surface-sunken text-ink-faint"
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          enabled ? "bg-status-success-ink" : "bg-ink-faint"
        }`}
      />
      {label}
    </span>
  );
}

export default function BillingPage() {
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetchJson<PlanInfo>("/cafes/my-plan")
      .then(setPlanInfo)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Billing & Plan" description="Your current subscription and usage." />
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !planInfo) {
    return (
      <div className="space-y-6">
        <PageHeader title="Billing & Plan" description="Your current subscription and usage." />
        <ErrorState
          title="Couldn't load billing info"
          description="Please refresh the page or contact your platform administrator."
        />
      </div>
    );
  }

  const planDisplay = PLAN_DISPLAY[planInfo.plan] ?? PLAN_DISPLAY.starter;

  return (
    <div className="space-y-6">
      <PageHeader title="Billing & Plan" description="Your current subscription and usage." />

      {/* Overdue banner */}
      {planInfo.isOverdue && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-300 bg-yellow-50 px-5 py-4">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
          <div>
            <p className="body-md font-semibold text-yellow-800">
              Your subscription payment is overdue
            </p>
            <p className="body-sm mt-0.5 text-yellow-700">
              Some features may be restricted until payment is received. Contact your platform
              administrator to resolve this.
            </p>
          </div>
        </div>
      )}

      {/* Plan card */}
      <SectionCard
        icon={<IconBanknote />}
        title="Current plan"
        description="Your active subscription tier and billing status."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${planDisplay.colorClass}`}>
                {planDisplay.label}
              </span>
              <span
                className={`label-sm rounded-pill px-2.5 py-0.5 font-semibold capitalize ${
                  STATUS_STYLES[planInfo.subscriptionStatus]
                }`}
              >
                {planInfo.subscriptionStatus}
              </span>
            </div>
            <p className="body-md text-ink-secondary">{planDisplay.price}</p>
            {planInfo.nextBillingAt && (
              <p className="body-sm text-ink-faint">
                Next billing date:{" "}
                <span className="font-medium text-ink-secondary">
                  {formatDate(planInfo.nextBillingAt)}
                </span>
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-sunken px-4 py-3 text-center">
            <p className="label-sm text-ink-faint">Need to upgrade?</p>
            <p className="body-sm mt-0.5 text-ink-secondary">Contact your platform admin</p>
          </div>
        </div>
      </SectionCard>

      {/* Usage meters */}
      {planInfo.usage && (
        <SectionCard
          icon={<IconReceipt />}
          title="Usage"
          description="How much of your plan limits you've used."
        >
          <div className="space-y-5">
            <UsageMeter
              label="Staff accounts"
              icon={IconUsers}
              used={planInfo.usage.staffCount}
              max={planInfo.features.maxStaff}
            />
            <UsageMeter
              label="Menu items"
              icon={IconClipboardList}
              used={planInfo.usage.menuItemCount}
              max={planInfo.features.maxMenuItems}
            />
            <UsageMeter
              label="Tables"
              icon={IconTable}
              used={planInfo.usage.tableCount}
              max={planInfo.features.maxTables}
            />
          </div>
        </SectionCard>
      )}

      {/* Features */}
      <SectionCard
        icon={<IconBarChart />}
        title="Plan features"
        description="What's included in your current plan."
      >
        <div className="flex flex-wrap gap-2">
          <FeaturePill enabled={true} label="Orders & billing" />
          <FeaturePill enabled={true} label="Menu management" />
          <FeaturePill enabled={true} label="Table management" />
          <FeaturePill enabled={planInfo.features.qrOrdering} label="QR ordering" />
          <FeaturePill enabled={planInfo.features.reports} label="Reports & analytics" />
        </div>

        {planInfo.plan === "starter" && (
          <div className="mt-4 rounded-lg border border-border-subtle bg-surface-sunken px-4 py-3">
            <p className="body-sm text-ink-secondary">
              <span className="font-semibold">Upgrade to Standard</span> to unlock QR ordering and
              detailed sales reports. Contact your platform administrator to upgrade.
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
