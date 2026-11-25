"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { platformFetchJson } from "../../lib/api";
import { StatCard, StatSkeleton } from "../../components/ui/StatCard";
import { Panel } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { BarChart, HBars } from "../../components/admin/charts";
import { IconBanknote, IconStore, IconReceipt, IconUsers, IconChevronRight, IconPlus } from "../../components/icons";
import { CafeAvatar, PLAN_KEYS, StatusPill, usePlans, type Plan, type SubStatus } from "../../components/platform/shared";
import { ago, rs, shortDate } from "../../lib/format";

type Mini = { id: number; name: string; slug: string; plan: Plan; subscriptionStatus: SubStatus; trialDaysLeft: number | null; nextBillingAt: string | null; lastOrderAt: string | null; logoUrl: string | null; themeColor: string | null };
type Overview = {
  totalCafes: number; activeCafes: number; totalStaff: number; ordersToday: number; totalOrders: number; mrr: number; gmv30: string;
  byStatus: Record<SubStatus, number>; byPlan: Record<Plan, number>; signups: { month: string; count: number }[];
  attention: { trialsEnding: Mini[]; overdue: Mini[]; renewalsDue: Mini[]; atRisk: Mini[] };
  recent: Mini[];
};

export default function PlatformOverview() {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const pl = usePlans();
  useEffect(() => {
    platformFetchJson<Overview>("/platform/overview").then(setD).catch((e) => setErr(e.message));
  }, []);

  const attention = d
    ? [
        ...d.attention.overdue.map((c) => ({ c, tone: "danger" as const, why: "Payment overdue" })),
        ...d.attention.trialsEnding.map((c) => ({ c, tone: "warning" as const, why: c.trialDaysLeft! > 0 ? `Trial ends in ${c.trialDaysLeft}d — convert` : "Trial ended — follow up" })),
        ...d.attention.renewalsDue.map((c) => ({ c, tone: "info" as const, why: `Renewal due ${c.nextBillingAt ? shortDate(c.nextBillingAt) : ""}` })),
        ...d.attention.atRisk.map((c) => ({ c, tone: "neutral" as const, why: c.lastOrderAt ? `No orders for ${ago(c.lastOrderAt).replace(" ago", "")}` : "Never took an order — help them set up" })),
      ]
    : [];
  const toneDot = { danger: "bg-status-danger", warning: "bg-status-warning", info: "bg-status-info", neutral: "bg-ink-faint" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Platform overview</h1>
          <p className="text-sm text-ink-secondary">Recurring revenue, cafes that need you, and how the platform is being used.</p>
        </div>
        <Link href="/platform/cafes?new=1"><Button icon={<IconPlus />}>Onboard cafe</Button></Link>
      </div>

      {err && <p className="rounded-xl bg-status-danger-tint px-4 py-3 text-sm text-status-danger-ink">{err}</p>}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {d ? (
          <>
            <StatCard icon={<IconBanknote />} label="Monthly recurring revenue" value={rs(d.mrr)} caption={`${d.byStatus.active ?? 0} paying · yearly plans counted per month`} />
            <StatCard icon={<IconStore />} label="Cafes" value={d.activeCafes} caption={`${d.byStatus.trial ?? 0} on trial · ${d.byStatus.overdue ?? 0} overdue`} captionTone={d.byStatus.overdue ? "danger" : undefined} />
            <StatCard icon={<IconReceipt />} label="Through all tills (30 days)" value={rs(d.gmv30)} caption={`${d.ordersToday} orders today`} />
            <StatCard icon={<IconUsers />} label="Active staff accounts" value={d.totalStaff} caption={`${d.totalOrders.toLocaleString("en-IN")} orders all-time`} />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel padded={false} className="xl:col-span-2">
          <div className="flex items-center justify-between px-5 pb-3 pt-5 sm:px-6">
            <div>
              <h3 className="text-base font-semibold">Needs attention</h3>
              <p className="text-sm text-ink-secondary">Overdue payments, trials ending, renewals this week, cafes gone quiet.</p>
            </div>
          </div>
          {!d ? <div className="h-40" /> : attention.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-ink-faint">Nothing needs you right now. 👌</p>
          ) : (
            <ul className="divide-y divide-border-subtle border-t border-border-subtle">
              {attention.map(({ c, tone, why }, i) => (
                <li key={`${c.id}-${i}`}>
                  <Link href={`/platform/cafes/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-surface-canvas sm:px-6">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${toneDot[tone]}`} />
                    <CafeAvatar name={c.name} logoUrl={c.logoUrl} color={c.themeColor} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-ink-secondary">{why}</p>
                    </div>
                    <span className="hidden text-xs text-ink-faint sm:block">{pl.name(c.plan)}</span>
                    <IconChevronRight className="h-4 w-4 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <h3 className="mb-4 text-base font-semibold">Paying cafes by plan</h3>
          {d ? (
            <HBars format={(n) => `${n}`} rows={PLAN_KEYS.map((p) => ({ label: pl.name(p), value: d.byPlan[p] ?? 0 }))} />
          ) : <div className="h-28" />}
          <div className="mt-6 grid grid-cols-4 gap-2 text-center">
            {(["trial", "active", "overdue", "cancelled"] as SubStatus[]).map((s) => (
              <div key={s} className="rounded-xl bg-surface-canvas py-2.5">
                <p className="tabular text-lg font-semibold">{d?.byStatus[s] ?? "–"}</p>
                <p className="text-[11px] capitalize text-ink-faint">{s}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <h3 className="mb-4 text-base font-semibold">New cafes per month</h3>
          {d && <BarChart height={180} format={(n) => `${n} cafe${n === 1 ? "" : "s"}`} data={d.signups.map((s) => ({ label: s.month, value: s.count }))} />}
        </Panel>
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold">Recently onboarded</h3>
            <Link href="/platform/cafes" className="text-sm font-medium text-brand-strong">All cafes</Link>
          </div>
          <ul className="space-y-3">
            {d?.recent.map((c) => (
              <li key={c.id}>
                <Link href={`/platform/cafes/${c.id}`} className="flex items-center gap-3">
                  <CafeAvatar name={c.name} logoUrl={c.logoUrl} color={c.themeColor} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-ink-faint">/c/{c.slug}</p>
                  </div>
                  <StatusPill status={c.subscriptionStatus} trialDaysLeft={c.trialDaysLeft} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
