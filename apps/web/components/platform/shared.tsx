"use client";

import { useEffect, useState } from "react";
import { Pill } from "../ui/Field";
import { platformFetchJson } from "../../lib/api";
import { assetUrl } from "../../lib/format";

export type Plan = "starter" | "standard" | "premium";
export type SubStatus = "trial" | "active" | "overdue" | "cancelled";

export const PLAN_LABEL: Record<Plan, string> = { starter: "Starter", standard: "Standard", premium: "Premium" };
export const PLAN_KEYS: Plan[] = ["starter", "standard", "premium"];

export type PlanConfig = {
  key: Plan; name: string; description: string | null; monthlyPrice: number; yearlyMonths: number;
  maxStaff: number | null; maxMenuItems: number | null; maxTables: number | null;
  qrOrdering: boolean; reports: boolean; inventory: boolean; tableGame: boolean;
  cafes?: number; trialCafes?: number;
};

// Plans are editable in /platform/plans, so prices/names are fetched, never
// hardcoded. One shared in-flight request per page load.
let plansPromise: Promise<PlanConfig[]> | null = null;
export function invalidatePlans() {
  plansPromise = null;
}
export function usePlans() {
  const [plans, setPlans] = useState<PlanConfig[] | null>(null);
  useEffect(() => {
    plansPromise ??= platformFetchJson<PlanConfig[]>("/platform/plans").catch((e) => { plansPromise = null; throw e; });
    plansPromise.then(setPlans).catch(() => {});
  }, []);
  const get = (k: Plan) => plans?.find((p) => p.key === k);
  return {
    plans,
    name: (k: Plan) => get(k)?.name ?? PLAN_LABEL[k],
    monthly: (k: Plan) => get(k)?.monthlyPrice ?? 0,
    /** Amount due per billing cycle. */
    cyclePrice: (k: Plan, cycle: string) => {
      const p = get(k);
      if (!p) return 0;
      return cycle === "yearly" ? p.monthlyPrice * p.yearlyMonths : p.monthlyPrice;
    },
  };
}

export function StatusPill({ status, isActive = true, trialDaysLeft }: { status: SubStatus; isActive?: boolean; trialDaysLeft?: number | null }) {
  if (!isActive) return <Pill tone="neutral">Deactivated</Pill>;
  if (status === "trial") {
    const left = trialDaysLeft ?? null;
    return <Pill tone={left != null && left <= 3 ? "warning" : "info"}>Trial{left != null ? (left > 0 ? ` · ${left}d left` : " · ended") : ""}</Pill>;
  }
  if (status === "active") return <Pill tone="success">Active</Pill>;
  if (status === "overdue") return <Pill tone="danger">Overdue</Pill>;
  return <Pill tone="neutral">Cancelled</Pill>;
}

export function CafeAvatar({ name, logoUrl, color, size = 40 }: { name: string; logoUrl?: string | null; color?: string | null; size?: number }) {
  const logo = assetUrl(logoUrl);
  return logo ? (
    <img src={logo} alt="" width={size} height={size} className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ width: size, height: size, background: color ?? "#475467" }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function loginUrl(slug: string) {
  return typeof window === "undefined" ? `/c/${slug}/login` : `${window.location.origin}/c/${slug}/login`;
}
