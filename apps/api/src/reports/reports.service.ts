import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ReportsQueryDto, GroupBy } from './dto/reports-query.dto.js';
import { assertReportsAllowed } from '../subscription/plan-limits.js';

const DEFAULT_RANGE_DAYS = 30;

type Range = { from: Date; to: Date };

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /** Fetches the cafe's plan fields and throws if reports aren't included. */
  private async assertPlanAccess(cafeId: number) {
    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true },
    });
    assertReportsAllowed(cafe);
  }

  // Revenue is read off Payment rows, not Order.total -- Payment.amount is
  // the actual amount collected at the moment of payment, while Order.total
  // gets cleared if a bill is reopened (see OrdersService.reopenToServed).
  // Every report below is scoped to a date range on Payment.paidAt, since
  // that's when the money actually changed hands, not when the order was
  // first opened.
  private resolveRange(dto: ReportsQueryDto): Range {
    // Date-only strings ("2026-09-21") parse as UTC midnight -- using
    // setUTCHours (not setHours) to widen them to a full day keeps that
    // consistent, rather than mixing a UTC-parsed instant with a
    // local-timezone day boundary (which would shift the range by the
    // server's UTC offset, e.g. Nepal's +5:45).
    const to = dto.to ? new Date(dto.to) : new Date();
    to.setUTCHours(23, 59, 59, 999);

    const from = dto.from
      ? new Date(dto.from)
      : new Date(to.getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);
    from.setUTCHours(0, 0, 0, 0);

    return { from, to };
  }

  async getSummary(cafeId: number, dto: ReportsQueryDto) {
    await this.assertPlanAccess(cafeId);

    const { from, to } = this.resolveRange(dto);

    const payments = await this.prisma.payment.findMany({
      where: { paidAt: { gte: from, lte: to }, order: { cafeId } },
      select: { amount: true },
    });

    const totalRevenue = payments.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
    const totalOrders = payments.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue.dividedBy(totalOrders) : new Prisma.Decimal(0);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalRevenue: totalRevenue.toFixed(2),
      totalOrders,
      avgOrderValue: avgOrderValue.toFixed(2),
    };
  }

  // Returns a bucket key for a given date based on the groupBy period.
  // All keys are ISO-formatted so the frontend can sort/display them easily.
  private bucketKey(date: Date, groupBy: GroupBy): string {
    const iso = date.toISOString();
    if (groupBy === 'day') return iso.slice(0, 10); // YYYY-MM-DD
    if (groupBy === 'month') return iso.slice(0, 7); // YYYY-MM
    if (groupBy === 'year') return iso.slice(0, 4);  // YYYY
    // week: return the Monday of the ISO week (YYYY-Www)
    const d = new Date(date);
    const day = d.getUTCDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day; // shift to Monday
    d.setUTCDate(d.getUTCDate() + diff);
    const year = d.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const weekNo = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
  }

  async getRevenueByPeriod(cafeId: number, dto: ReportsQueryDto) {
    await this.assertPlanAccess(cafeId);

    const { from, to } = this.resolveRange(dto);
    const groupBy: GroupBy = dto.groupBy ?? 'day';

    const payments = await this.prisma.payment.findMany({
      where: { paidAt: { gte: from, lte: to }, order: { cafeId } },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    });

    const byPeriod = new Map<string, { revenue: Prisma.Decimal; orders: number }>();
    for (const payment of payments) {
      const key = this.bucketKey(payment.paidAt, groupBy);
      const bucket = byPeriod.get(key) ?? { revenue: new Prisma.Decimal(0), orders: 0 };
      bucket.revenue = bucket.revenue.plus(payment.amount);
      bucket.orders += 1;
      byPeriod.set(key, bucket);
    }

    return [...byPeriod.entries()].map(([period, bucket]) => ({
      period,
      groupBy,
      revenue: bucket.revenue.toFixed(2),
      orders: bucket.orders,
    }));
  }

  async getTopItems(cafeId: number, dto: ReportsQueryDto, limit = 10) {
    await this.assertPlanAccess(cafeId);

    const { from, to } = this.resolveRange(dto);

    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          cafeId,
          status: 'paid',
          payments: { some: { paidAt: { gte: from, lte: to } } },
        },
      },
      select: {
        quantity: true,
        price: true,
        menuItem: { select: { id: true, name: true } },
        orderItemModifiers: { select: { modifier: { select: { priceDelta: true } } } },
      },
    });

    const byItem = new Map<number, { name: string; quantitySold: number; revenue: Prisma.Decimal }>();
    for (const item of orderItems) {
      const modifierTotal = item.orderItemModifiers.reduce(
        (sum, oim) => sum.plus(oim.modifier.priceDelta),
        new Prisma.Decimal(0),
      );
      const lineTotal = item.price.plus(modifierTotal).times(item.quantity);

      const bucket = byItem.get(item.menuItem.id) ?? {
        name: item.menuItem.name,
        quantitySold: 0,
        revenue: new Prisma.Decimal(0),
      };
      bucket.quantitySold += item.quantity;
      bucket.revenue = bucket.revenue.plus(lineTotal);
      byItem.set(item.menuItem.id, bucket);
    }

    return [...byItem.entries()]
      .map(([menuItemId, bucket]) => ({
        menuItemId,
        name: bucket.name,
        quantitySold: bucket.quantitySold,
        revenue: bucket.revenue.toFixed(2),
      }))
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, limit);
  }

  async getPaymentMethods(cafeId: number, dto: ReportsQueryDto) {
    await this.assertPlanAccess(cafeId);

    const { from, to } = this.resolveRange(dto);

    const payments = await this.prisma.payment.findMany({
      where: { paidAt: { gte: from, lte: to }, order: { cafeId } },
      select: { amount: true, method: true },
    });

    const byMethod = new Map<string, { amount: Prisma.Decimal; count: number }>();
    for (const payment of payments) {
      const bucket = byMethod.get(payment.method) ?? { amount: new Prisma.Decimal(0), count: 0 };
      bucket.amount = bucket.amount.plus(payment.amount);
      bucket.count += 1;
      byMethod.set(payment.method, bucket);
    }

    return [...byMethod.entries()].map(([method, bucket]) => ({
      method,
      amount: bucket.amount.toFixed(2),
      count: bucket.count,
    }));
  }

  async getDailyReport(cafeId: number, date: string) {
    // Build a full-day range for the given date (UTC, consistent with resolveRange)
    const from = new Date(date);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setUTCHours(23, 59, 59, 999);

    const dto = { from: from.toISOString(), to: to.toISOString() };

    const [summary, topItems, paymentMethods] = await Promise.all([
      this.getSummary(cafeId, dto),
      this.getTopItems(cafeId, dto, 20),
      this.getPaymentMethods(cafeId, dto),
    ]);

    return { date, summary, topItems, paymentMethods };
  }

}
