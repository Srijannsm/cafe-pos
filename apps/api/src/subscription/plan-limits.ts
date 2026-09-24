import { ForbiddenException } from '@nestjs/common';
import type { Cafe } from '../generated/prisma/client.js';

// Feature matrix — what each plan gets.
// Trial mirrors Premium; overdue is a special status handled separately
// (read-only: cannot create new orders/items/tables/staff).
export const PLAN_LIMITS = {
  starter: {
    maxStaff: 3,
    maxMenuItems: 20,
    maxTables: 10,
    qrOrdering: false,
    reports: false,
  },
  standard: {
    maxStaff: 10,
    maxMenuItems: 100,
    maxTables: 30,
    qrOrdering: true,
    reports: true,
  },
  premium: {
    maxStaff: Infinity,
    maxMenuItems: Infinity,
    maxTables: Infinity,
    qrOrdering: true,
    reports: true,
  },
  trial: {
    maxStaff: Infinity,
    maxMenuItems: Infinity,
    maxTables: Infinity,
    qrOrdering: true,
    reports: true,
  },
} as const;

type PlanKey = keyof typeof PLAN_LIMITS;

/** Resolves the effective plan key, treating trial as its own entry. */
function effectivePlanKey(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>): PlanKey {
  if (cafe.subscriptionStatus === 'trial') return 'trial';
  return (cafe.plan ?? 'starter') as PlanKey;
}

/** Throws ForbiddenException if the subscription is overdue (read-only mode). */
export function assertNotOverdue(cafe: Pick<Cafe, 'subscriptionStatus'>) {
  if (cafe.subscriptionStatus === 'overdue') {
    throw new ForbiddenException(
      'Your subscription is overdue. Please contact your platform administrator to restore access.',
    );
  }
}

/** Throws ForbiddenException if the cafe's plan doesn't include QR self-ordering. */
export function assertQrOrderingAllowed(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>) {
  const key = effectivePlanKey(cafe);
  if (!PLAN_LIMITS[key].qrOrdering) {
    throw new ForbiddenException(
      'QR self-ordering is not available on your current plan. Upgrade to Standard or higher to enable it.',
    );
  }
}

/** Throws ForbiddenException if the cafe's plan doesn't include reports. */
export function assertReportsAllowed(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>) {
  const key = effectivePlanKey(cafe);
  if (!PLAN_LIMITS[key].reports) {
    throw new ForbiddenException(
      'Reports are not available on your current plan. Upgrade to Standard or higher to access reports.',
    );
  }
}

/** Throws ForbiddenException if adding one more staff member would exceed the plan limit. */
export function assertStaffLimit(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, currentCount: number) {
  const key = effectivePlanKey(cafe);
  const max = PLAN_LIMITS[key].maxStaff;
  if (currentCount >= max) {
    throw new ForbiddenException(
      `Your plan allows up to ${max} staff member${max === 1 ? '' : 's'}. ` +
        `You currently have ${currentCount}. Upgrade your plan to add more.`,
    );
  }
}

/** Throws ForbiddenException if adding one more menu item would exceed the plan limit. */
export function assertMenuItemLimit(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, currentCount: number) {
  const key = effectivePlanKey(cafe);
  const max = PLAN_LIMITS[key].maxMenuItems;
  if (currentCount >= max) {
    throw new ForbiddenException(
      `Your plan allows up to ${max} menu item${max === 1 ? '' : 's'}. ` +
        `You currently have ${currentCount}. Upgrade your plan to add more.`,
    );
  }
}

/** Throws ForbiddenException if adding one more table would exceed the plan limit. */
export function assertTableLimit(cafe: Pick<Cafe, 'plan' | 'subscriptionStatus'>, currentCount: number) {
  const key = effectivePlanKey(cafe);
  const max = PLAN_LIMITS[key].maxTables;
  if (currentCount >= max) {
    throw new ForbiddenException(
      `Your plan allows up to ${max} table${max === 1 ? '' : 's'}. ` +
        `You currently have ${currentCount}. Upgrade your plan to add more.`,
    );
  }
}
