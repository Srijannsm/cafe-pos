import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PLAN_LIMITS } from '../subscription/plan-limits.js';

type PlanKey = keyof typeof PLAN_LIMITS;

@Injectable()
export class CafesService {
  constructor(private prisma: PrismaService) {}

  // Every other lookup in this module goes through here first -- the slug
  // in the URL is the only thing identifying which cafe's data a request
  // is even allowed to touch before anyone has logged in.
  async findBySlugOrThrow(slug: string) {
    const cafe = await this.prisma.cafe.findUnique({ where: { slug } });
    if (!cafe || !cafe.isActive) {
      throw new NotFoundException(`No cafe found for "${slug}"`);
    }
    return cafe;
  }

  // Public, pre-login: the /c/:slug/login page calls this to confirm the
  // slug is real and get a display name, before it ever shows a PIN pad.
  async findPublicBySlug(slug: string) {
    const cafe = await this.findBySlugOrThrow(slug);
    return { id: cafe.id, name: cafe.name, slug: cafe.slug };
  }

  // Public, pre-login: replaces the old global /users/login-options --
  // that used to list every active user across every cafe, which is
  // obviously wrong once there's more than one cafe on the platform.
  async findStaffForLogin(slug: string) {
    const cafe = await this.findBySlugOrThrow(slug);
    return this.prisma.user.findMany({
      where: { cafeId: cafe.id, isActive: true },
      select: { id: true, name: true, role: true },
    });
  }

  /** Returns the cafe's plan info and feature flags for frontend gating. */
  async getPlanInfo(cafeId: number) {
    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true, nextBillingAt: true },
    });

    // Trial mirrors Premium limits; overdue is special (read-only)
    const planKey: PlanKey =
      cafe.subscriptionStatus === 'trial' ? 'trial' : ((cafe.plan ?? 'starter') as PlanKey);

    const limits = PLAN_LIMITS[planKey];

    const [staffCount, menuItemCount, tableCount] = await Promise.all([
      this.prisma.user.count({ where: { cafeId } }),
      this.prisma.menuItem.count({ where: { cafeId } }),
      this.prisma.restaurantTable.count({ where: { cafeId } }),
    ]);

    return {
      plan: cafe.plan,
      subscriptionStatus: cafe.subscriptionStatus,
      nextBillingAt: cafe.nextBillingAt,
      isOverdue: cafe.subscriptionStatus === 'overdue',
      features: {
        qrOrdering: limits.qrOrdering,
        reports: limits.reports,
        maxStaff: limits.maxStaff === Infinity ? null : limits.maxStaff,
        maxMenuItems: limits.maxMenuItems === Infinity ? null : limits.maxMenuItems,
        maxTables: limits.maxTables === Infinity ? null : limits.maxTables,
      },
      usage: { staffCount, menuItemCount, tableCount },
    };
  }
}
