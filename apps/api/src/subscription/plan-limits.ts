import { ForbiddenException } from '@nestjs/common';
import type { Cafe } from '../generated/prisma/client.js';

// What each plan includes. The source of truth is the `plan_configs` table
// (edited by the superadmin in /platform/plans); PlansService loads it into
// this in-memory cache at boot, after every edit, and every 60s. Keeping a
// cache means every check below stays a cheap synchronous lookup instead of
// a DB query on each request. The defaults here only apply until the first
// load finishes and match the seed data in the plan_configs migration.

export type PlanKey = 'starter' | 'standard' | 'premium';
export type PlanFeature = 'qrOrdering' | 'reports' | 'inventory' | 'tableGame';
export const PLAN_FEATURES: PlanFeature[] = ['qrOrdering', 'reports', 'inventory', 'tableGame'];

export type PlanLimits = {
  key: PlanKey;
  name: string;
  description: string | null;
  monthlyPrice: number;
  yearlyMonths: number;
  maxStaff: number; // Infinity = unlimited
  maxMenuItems: number;
  maxTables: number;
} & Record<PlanFeature, boolean>;

const DEFAULTS: Record<PlanKey, PlanLimits> = {
  starter: { key: 'starter', name: 'Starter', description: null, monthlyPrice: 999, yearlyMonths: 10, maxStaff: 3, maxMenuItems: 20, maxTables: 10, qrOrdering: false, reports: false, inventory: false, tableGame: false },
  standard: { key: 'standard', name: 'Standard', description: null, monthlyPrice: 1999, yearlyMonths: 10, maxStaff: 10, maxMenuItems: 100, maxTables: 30, qrOrdering: true, reports: true, inventory: true, tableGame: false },
  premium: { key: 'premium', name: 'Premium', description: null, monthlyPrice: 3499, yearlyMonths: 10, maxStaff: Infinity, maxMenuItems: Infinity, maxTables: Infinity, qrOrdering: true, reports: true, inventory: true, tableGame: true },
};

let plans: Record<PlanKey, PlanLimits> = { ...DEFAULTS };

export function setPlanConfigs(rows: PlanLimits[]) {
  const next = { ...DEFAULTS };
  for (const r of rows) next[r.key] = r;
  plans = next;
}

export function getPlan(key: PlanKey): PlanLimits {
  return plans[key] ?? plans.starter;
}

export function allPlans(): PlanLimits[] {
  return (['starter', 'standard', 'premium'] as PlanKey[]).map(getPlan);
}

/** Trial cafes get the Premium plan's features and limits ("try everything"). */
export function effectivePlan(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>): PlanLimits {
  if (cafe.subscriptionStatus === 'trial') return getPlan('premium');
  return getPlan((cafe.plan ?? 'starter') as PlanKey);
}

export function hasFeature(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, feature: PlanFeature) {
  return effectivePlan(cafe)[feature];
}

const FEATURE_NAMES: Record<PlanFeature, string> = {
  qrOrdering: 'QR self-ordering',
  reports: 'Reports',
  inventory: 'Inventory',
  tableGame: 'The customer table game',
};

export function assertFeature(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, feature: PlanFeature) {
  if (!hasFeature(cafe, feature)) {
    const upgrade = allPlans().find((p) => p[feature]);
    throw new ForbiddenException(
      `${FEATURE_NAMES[feature]} is not included in your current plan.${upgrade ? ` Upgrade to ${upgrade.name} or higher to enable it.` : ''}`,
    );
  }
}

/** Throws ForbiddenException if the subscription is overdue (read-only mode). */
export function assertNotOverdue(cafe: Pick<Cafe, 'subscriptionStatus'>) {
  if (cafe.subscriptionStatus === 'overdue') {
    throw new ForbiddenException(
      'Your subscription is overdue. Please contact your platform administrator to restore access.',
    );
  }
}

export function assertQrOrderingAllowed(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>) {
  assertFeature(cafe, 'qrOrdering');
}

export function assertReportsAllowed(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>) {
  assertFeature(cafe, 'reports');
}

function assertLimit(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, currentCount: number, field: 'maxStaff' | 'maxMenuItems' | 'maxTables', noun: string) {
  const max = effectivePlan(cafe)[field];
  if (currentCount >= max) {
    throw new ForbiddenException(
      `Your plan allows up to ${max} ${noun}${max === 1 ? '' : 's'}. You currently have ${currentCount}. Upgrade your plan to add more.`,
    );
  }
}

export function assertStaffLimit(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, currentCount: number) {
  assertLimit(cafe, currentCount, 'maxStaff', 'staff member');
}

export function assertMenuItemLimit(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, currentCount: number) {
  assertLimit(cafe, currentCount, 'maxMenuItems', 'menu item');
}

export function assertTableLimit(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, currentCount: number) {
  assertLimit(cafe, currentCount, 'maxTables', 'table');
}

export const TRIAL_DAYS = 14;

/** What a cafe contributes to monthly recurring revenue right now. */
export function monthlyValue(cafe: { plan: PlanKey; billingCycle: string; subscriptionStatus: string; isActive: boolean }) {
  if (!cafe.isActive || cafe.subscriptionStatus !== 'active') return 0;
  const p = getPlan(cafe.plan);
  return cafe.billingCycle === 'yearly' ? (p.monthlyPrice * p.yearlyMonths) / 12 : p.monthlyPrice;
}

/** Amount due for one billing cycle. */
export function cyclePrice(plan: PlanKey, billingCycle: string) {
  const p = getPlan(plan);
  return billingCycle === 'yearly' ? p.monthlyPrice * p.yearlyMonths : p.monthlyPrice;
}

/** JSON-safe version (Infinity -> null) for API responses. */
export function serializePlan(p: PlanLimits) {
  const lim = (n: number) => (Number.isFinite(n) ? n : null);
  return { ...p, maxStaff: lim(p.maxStaff), maxMenuItems: lim(p.maxMenuItems), maxTables: lim(p.maxTables) };
}
