import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { allPlans, assertFeature, assertStaffLimit, effectivePlan, hasFeature, monthlyValue, setPlanConfigs } from './plan-limits.js';

describe('plan limits (editable plans)', () => {
  beforeEach(() => setPlanConfigs([]));

  it('trial cafes get the premium plan', () => {
    expect(effectivePlan({ plan: 'starter', subscriptionStatus: 'trial' } as any).key).toBe('premium');
  });

  it('uses the edited config after setPlanConfigs', () => {
    const starter = allPlans()[0]!;
    expect(hasFeature({ plan: 'starter', subscriptionStatus: 'active' } as any, 'inventory')).toBe(false);
    setPlanConfigs([{ ...starter, inventory: true, maxStaff: 5 }]);
    expect(hasFeature({ plan: 'starter', subscriptionStatus: 'active' } as any, 'inventory')).toBe(true);
    expect(() => assertStaffLimit({ plan: 'starter', subscriptionStatus: 'active' } as any, 4)).not.toThrow();
    expect(() => assertStaffLimit({ plan: 'starter', subscriptionStatus: 'active' } as any, 5)).toThrow(ForbiddenException);
  });

  it('names the cheapest plan that has a missing feature', () => {
    expect(() => assertFeature({ plan: 'starter', subscriptionStatus: 'active' } as any, 'reports')).toThrow(/Upgrade to Standard/);
  });

  it('counts yearly plans per month in MRR', () => {
    expect(monthlyValue({ plan: 'standard', billingCycle: 'yearly', subscriptionStatus: 'active', isActive: true })).toBeCloseTo((1999 * 10) / 12);
    expect(monthlyValue({ plan: 'standard', billingCycle: 'monthly', subscriptionStatus: 'trial', isActive: true })).toBe(0);
  });
});
