import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type PlanKey, type PlanLimits, serializePlan, setPlanConfigs, allPlans } from '../subscription/plan-limits.js';
import { UpdatePlanDto } from './update-plan.dto.js';

// Keeps the plan cache in subscription/plan-limits.ts in sync with the
// plan_configs table. Refreshes on boot, right after an edit, and every 60s
// (so a second API instance picks up an edit within a minute).
@Injectable()
export class PlansService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlansService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
    this.timer = setInterval(() => this.reload(), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reload() {
    try {
      const rows = await this.prisma.planConfig.findMany();
      setPlanConfigs(
        rows.map((r): PlanLimits => ({
          key: r.key as PlanKey,
          name: r.name,
          description: r.description,
          monthlyPrice: Number(r.monthlyPrice),
          yearlyMonths: r.yearlyMonths,
          maxStaff: r.maxStaff ?? Infinity,
          maxMenuItems: r.maxMenuItems ?? Infinity,
          maxTables: r.maxTables ?? Infinity,
          qrOrdering: r.qrOrdering,
          reports: r.reports,
          inventory: r.inventory,
          tableGame: r.tableGame,
        })),
      );
    } catch (e) {
      // Table missing (migration not run yet) -> keep the built-in defaults.
      this.logger.warn(`Could not load plan_configs, using defaults: ${(e as Error).message}`);
    }
  }

  /** For the platform Plans page: every plan plus how many cafes are on it. */
  async listWithUsage() {
    const counts = await this.prisma.cafe.groupBy({ by: ['plan', 'subscriptionStatus'], _count: { _all: true } });
    return allPlans().map((p) => ({
      ...serializePlan(p),
      cafes: counts.filter((c) => c.plan === p.key && c.subscriptionStatus !== 'trial').reduce((s, c) => s + c._count._all, 0),
      trialCafes: p.key === 'premium' ? counts.filter((c) => c.subscriptionStatus === 'trial').reduce((s, c) => s + c._count._all, 0) : 0,
    }));
  }

  async update(key: PlanKey, dto: UpdatePlanDto) {
    const existing = await this.prisma.planConfig.findUnique({ where: { key } });
    const data = {
      ...dto,
      // "Unlimited" arrives as null; undefined means "not sent".
      ...('maxStaff' in dto ? { maxStaff: dto.maxStaff ?? null } : {}),
      ...('maxMenuItems' in dto ? { maxMenuItems: dto.maxMenuItems ?? null } : {}),
      ...('maxTables' in dto ? { maxTables: dto.maxTables ?? null } : {}),
    };
    if (!existing) {
      const base = allPlans().find((p) => p.key === key);
      if (!base) throw new NotFoundException('Unknown plan');
      const s = serializePlan(base);
      await this.prisma.planConfig.create({
        data: {
          key, name: s.name, description: s.description, monthlyPrice: s.monthlyPrice, yearlyMonths: s.yearlyMonths,
          maxStaff: s.maxStaff, maxMenuItems: s.maxMenuItems, maxTables: s.maxTables,
          qrOrdering: s.qrOrdering, reports: s.reports, inventory: s.inventory, tableGame: s.tableGame, ...data,
        },
      });
    } else {
      await this.prisma.planConfig.update({ where: { key }, data });
    }
    await this.reload();
    return this.listWithUsage();
  }
}
