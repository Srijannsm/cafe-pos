import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateCafeDto } from './dto/create-cafe.dto.js';
import { ExtendTrialDto, RecordSubscriptionPaymentDto, ResetPinDto, UpdateCafeDto } from './dto/update-cafe.dto.js';
import { TRIAL_DAYS, allPlans, monthlyValue, serializePlan } from '../subscription/plan-limits.js';

const DAY = 86400000;

const CAFE_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  logoUrl: true,
  themeColor: true,
  vatEnabled: true,
  vatRate: true,
  panNumber: true,
  plan: true,
  billingCycle: true,
  subscriptionStatus: true,
  trialStartedAt: true,
  nextBillingAt: true,
  createdAt: true,
  _count: { select: { users: true, orders: true, tables: true, menuItems: true } },
} as const;

type CafeSummary = Prisma.CafeGetPayload<{ select: typeof CAFE_SUMMARY_SELECT }>;

// The superadmin panel answers three questions for whoever runs the
// platform: how much recurring money is coming in, who needs attention
// (trials ending, overdue, cafes that stopped using the app), and what each
// cafe is doing. Everything here is cross-tenant on purpose -- it is only
// reachable with a platform JWT (PlatformJwtAuthGuard), never a cafe token.
@Injectable()
export class PlatformAdminService {
  constructor(private prisma: PrismaService) {}

  private trialEndsAt(c: { trialStartedAt: Date }) {
    return new Date(c.trialStartedAt.getTime() + TRIAL_DAYS * DAY);
  }

  /** Per-cafe activity in the last 30 days: orders, money through the till, last order time. */
  private async activity(cafeIds?: number[]) {
    const since = new Date(Date.now() - 30 * DAY);
    const where = cafeIds ? { cafeId: { in: cafeIds } } : {};
    const [orders, last, gmv] = await Promise.all([
      this.prisma.order.groupBy({ by: ['cafeId'], where: { ...where, status: 'paid', createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['cafeId'], where, _max: { createdAt: true } }),
      this.prisma.$queryRaw<{ cafeId: number; amount: Prisma.Decimal }[]>`
        SELECT o."cafeId" AS "cafeId", COALESCE(SUM(p.amount), 0) AS amount
        FROM payments p JOIN orders o ON o.id = p."orderId"
        WHERE p."paidAt" >= ${since}
        GROUP BY o."cafeId"`,
    ]);
    const map = new Map<number, { orders30: number; gmv30: string; lastOrderAt: Date | null }>();
    const get = (id: number) => map.get(id) ?? { orders30: 0, gmv30: '0.00', lastOrderAt: null };
    for (const o of orders) map.set(o.cafeId, { ...get(o.cafeId), orders30: o._count._all });
    for (const l of last) map.set(l.cafeId, { ...get(l.cafeId), lastOrderAt: l._max.createdAt });
    for (const g of gmv) {
      if (cafeIds && !cafeIds.includes(g.cafeId)) continue;
      map.set(g.cafeId, { ...get(g.cafeId), gmv30: new Prisma.Decimal(g.amount).toFixed(2) });
    }
    return { get };
  }

  private decorate(c: CafeSummary, act: { orders30: number; gmv30: string; lastOrderAt: Date | null }) {
    const trialEndsAt = this.trialEndsAt(c);
    return {
      ...c,
      ...act,
      trialEndsAt,
      trialDaysLeft: c.subscriptionStatus === 'trial' ? Math.ceil((trialEndsAt.getTime() - Date.now()) / DAY) : null,
      mrr: monthlyValue(c),
      // "At risk" = an active cafe whose staff haven't rung up an order in a week.
      atRisk: c.isActive && c.subscriptionStatus !== 'cancelled' && (!act.lastOrderAt || Date.now() - act.lastOrderAt.getTime() > 7 * DAY),
    };
  }

  async getOverview() {
    const cafes = await this.prisma.cafe.findMany({ select: CAFE_SUMMARY_SELECT, orderBy: { createdAt: 'desc' } });
    const act = await this.activity();
    const rows = cafes.map((c) => this.decorate(c, act.get(c.id)));
    const today = new Date(new Date().setHours(0, 0, 0, 0));

    const [totalStaff, ordersToday, gmv30] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.order.count({ where: { createdAt: { gte: today } } }),
      this.prisma.payment.aggregate({ where: { paidAt: { gte: new Date(Date.now() - 30 * DAY) } }, _sum: { amount: true } }),
    ]);

    // New cafes per month, last 6 months.
    const signups: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      signups.push({ month: key, count: cafes.filter((c) => c.createdAt.toISOString().slice(0, 7) === key).length });
    }

    const byStatus = { trial: 0, active: 0, overdue: 0, cancelled: 0 } as Record<string, number>;
    for (const c of rows) byStatus[c.subscriptionStatus] = (byStatus[c.subscriptionStatus] ?? 0) + 1;
    const byPlan = { starter: 0, standard: 0, premium: 0 } as Record<string, number>;
    for (const c of rows.filter((r) => r.subscriptionStatus === 'active')) byPlan[c.plan] = (byPlan[c.plan] ?? 0) + 1;

    const pick = (c: (typeof rows)[number]) => ({
      id: c.id, name: c.name, slug: c.slug, plan: c.plan, subscriptionStatus: c.subscriptionStatus,
      trialDaysLeft: c.trialDaysLeft, nextBillingAt: c.nextBillingAt, lastOrderAt: c.lastOrderAt, logoUrl: c.logoUrl, themeColor: c.themeColor,
    });

    return {
      totalCafes: cafes.length,
      activeCafes: rows.filter((c) => c.isActive).length,
      totalStaff,
      ordersToday,
      totalOrders: rows.reduce((s, c) => s + c._count.orders, 0),
      mrr: Math.round(rows.reduce((s, c) => s + c.mrr, 0)),
      gmv30: (gmv30._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      byStatus,
      byPlan,
      signups,
      attention: {
        trialsEnding: rows.filter((c) => c.subscriptionStatus === 'trial' && c.isActive && (c.trialDaysLeft ?? 99) <= 5).map(pick),
        overdue: rows.filter((c) => c.subscriptionStatus === 'overdue' && c.isActive).map(pick),
        renewalsDue: rows
          .filter((c) => c.subscriptionStatus === 'active' && c.nextBillingAt && c.nextBillingAt.getTime() - Date.now() < 7 * DAY)
          .map(pick),
        atRisk: rows.filter((c) => c.atRisk).map(pick),
      },
      recent: rows.slice(0, 5).map(pick),
    };
  }

  async findAllCafes() {
    const cafes = await this.prisma.cafe.findMany({ select: CAFE_SUMMARY_SELECT, orderBy: { createdAt: 'desc' } });
    const act = await this.activity();
    return cafes.map((c) => this.decorate(c, act.get(c.id)));
  }

  async findCafeDetail(id: number) {
    const cafe = await this.prisma.cafe.findUnique({
      where: { id },
      select: {
        ...CAFE_SUMMARY_SELECT,
        setupFeePaid: true,
        subscriptionNotes: true,
        inventoryEnabled: true,
        gamesEnabled: true,
        phone: true,
        address: true,
        users: { select: { id: true, name: true, role: true, isActive: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] },
      },
    });
    if (!cafe) throw new NotFoundException(`Cafe ${id} does not exist`);

    const act = await this.activity([id]);
    const since = new Date(Date.now() - 30 * DAY);
    const [recentOrders, daily, qrOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: { cafeId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, orderType: true, status: true, total: true, createdAt: true, source: true, table: { select: { tableNumber: true } } },
      }),
      this.prisma.$queryRaw<{ day: string; amount: Prisma.Decimal; bills: bigint }[]>`
        SELECT to_char(p."paidAt" + interval '345 minutes', 'YYYY-MM-DD') AS day,
               COALESCE(SUM(p.amount), 0) AS amount, COUNT(DISTINCT p."orderId") AS bills
        FROM payments p JOIN orders o ON o.id = p."orderId"
        WHERE o."cafeId" = ${id} AND p."paidAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.order.count({ where: { cafeId: id, source: 'qr', createdAt: { gte: since } } }),
    ]);

    const series: { period: string; sales: string; bills: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = new Date(Date.now() + 345 * 60000 - i * DAY).toISOString().slice(0, 10);
      const row = daily.find((d) => d.day === key);
      series.push({ period: key, sales: row ? new Prisma.Decimal(row.amount).toFixed(2) : '0.00', bills: row ? Number(row.bills) : 0 });
    }

    return { ...this.decorate(cafe, act.get(id)), recentOrders, series, qrOrders30: qrOrders, plans: allPlans().map(serializePlan) };
  }

  async createCafe(dto: CreateCafeDto) {
    const existing = await this.prisma.cafe.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`A cafe with slug "${dto.slug}" already exists`);

    const pinHash = await bcrypt.hash(dto.adminPin, 10);
    const startTrial = dto.startTrial ?? true;

    return this.prisma.cafe.create({
      data: {
        name: dto.name.trim(),
        slug: dto.slug,
        vatEnabled: dto.vatEnabled ?? false,
        vatRate: dto.vatEnabled && dto.vatRate != null ? dto.vatRate : 13,
        panNumber: dto.vatEnabled ? (dto.panNumber ?? null) : null,
        plan: dto.plan ?? 'starter',
        billingCycle: dto.billingCycle ?? 'monthly',
        subscriptionStatus: startTrial ? 'trial' : 'active',
        nextBillingAt: startTrial ? new Date(Date.now() + TRIAL_DAYS * DAY) : addCycle(new Date(), dto.billingCycle ?? 'monthly'),
        users: { create: { name: dto.adminName.trim(), pinHash, role: 'admin' } },
      },
      select: { ...CAFE_SUMMARY_SELECT, users: { select: { id: true, name: true, role: true } } },
    });
  }

  async updateCafe(id: number, dto: UpdateCafeDto) {
    await this.findOrThrow(id);

    // Partial update -- only touch the fields the caller actually sent.
    const data: Record<string, unknown> = {};
    const keys = ['name', 'isActive', 'vatEnabled', 'vatRate', 'plan', 'billingCycle', 'subscriptionStatus', 'setupFeePaid', 'inventoryEnabled', 'gamesEnabled'] as const;
    for (const k of keys) if (dto[k] !== undefined) data[k] = dto[k];
    if ('panNumber' in dto) data.panNumber = dto.panNumber ?? null;
    if ('logoUrl' in dto) data.logoUrl = dto.logoUrl ?? null;
    if ('nextBillingAt' in dto) data.nextBillingAt = dto.nextBillingAt ? new Date(dto.nextBillingAt) : null;
    if ('subscriptionNotes' in dto) data.subscriptionNotes = dto.subscriptionNotes ?? null;

    return this.prisma.cafe.update({ where: { id }, data, select: CAFE_SUMMARY_SELECT });
  }

  async recordPayment(id: number, dto: RecordSubscriptionPaymentDto) {
    const cafe = await this.findOrThrow(id);
    // Extend from the later of "today" and the current due date, so paying
    // early doesn't lose days and paying late doesn't gift free months.
    const base = cafe.nextBillingAt && cafe.nextBillingAt > new Date() ? cafe.nextBillingAt : new Date();
    const next = addCycle(base, cafe.billingCycle);
    const line = `${new Date().toISOString().slice(0, 10)} · Paid Rs ${dto.amount.toLocaleString('en-IN')} via ${dto.method}${dto.reference ? ` (${dto.reference})` : ''} · ${cafe.plan} ${cafe.billingCycle} · next due ${next.toISOString().slice(0, 10)}`;
    return this.prisma.cafe.update({
      where: { id },
      data: {
        subscriptionStatus: 'active',
        isActive: true,
        nextBillingAt: next,
        subscriptionNotes: [line, cafe.subscriptionNotes].filter(Boolean).join('\n'),
      },
      select: CAFE_SUMMARY_SELECT,
    });
  }

  async extendTrial(id: number, dto: ExtendTrialDto) {
    const cafe = await this.findOrThrow(id);
    if (cafe.subscriptionStatus !== 'trial') throw new BadRequestException('This cafe is not on a trial');
    // Trial end is derived from trialStartedAt, so extending moves the start forward.
    const trialStartedAt = new Date(cafe.trialStartedAt.getTime() + dto.days * DAY);
    return this.prisma.cafe.update({
      where: { id },
      data: { trialStartedAt, nextBillingAt: new Date(trialStartedAt.getTime() + TRIAL_DAYS * DAY) },
      select: CAFE_SUMMARY_SELECT,
    });
  }

  // For the "owner forgot their PIN" phone call.
  async resetPin(cafeId: number, userId: number, dto: ResetPinDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, cafeId } });
    if (!user) throw new NotFoundException('Staff member not found');
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash: await bcrypt.hash(dto.pin, 10), isActive: true } });
    return { ok: true };
  }

  private async findOrThrow(id: number) {
    const cafe = await this.prisma.cafe.findUnique({ where: { id } });
    if (!cafe) throw new NotFoundException(`Cafe ${id} does not exist`);
    return cafe;
  }
}

function addCycle(from: Date, cycle: string) {
  const d = new Date(from);
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}
