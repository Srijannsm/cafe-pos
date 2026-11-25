import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertFeature, type PlanFeature } from '../subscription/plan-limits.js';

export const PLAN_FEATURE_KEY = 'planFeature';
/** Blocks the route (403) unless the caller's cafe plan includes the feature. */
export const RequiresFeature = (feature: PlanFeature) => SetMetadata(PLAN_FEATURE_KEY, feature);

// Runs after JwtAuthGuard, so request.user.cafeId comes from the verified token.
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(PLAN_FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!feature) return true;
    const cafeId = context.switchToHttp().getRequest().user?.cafeId as number | undefined;
    if (!cafeId) return false;
    const cafe = await this.prisma.cafe.findUniqueOrThrow({ where: { id: cafeId }, select: { plan: true, subscriptionStatus: true } });
    assertFeature(cafe, feature);
    return true;
  }
}
