import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ReportsQueryDto } from './dto/reports-query.dto.js';

const DEFAULT_RANGE_DAYS = 30;

type Range = { from: Date; to: Date };

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

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

  async getRevenueByDay(cafeId: number, dto: ReportsQueryDto) {
    const { from, to } = this.resolveRange(dto);

    const payments = await this.prisma.payment.findMany({
      where: { paidAt: { gte: from, lte: to }, order: { cafeId } },
      select: { amount: true, paidAt: true },
      orderBy: { paidAt: 'asc' },
    });

    const byDay = new Map<string, { revenue: Prisma.Decimal; orders: number }>();
    for (const payment of payments) {
      const day = payment.paidAt.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { revenue: new Prisma.Decimal(0), orders: 0 };
      bucket.revenue = bucket.revenue.plus(payment.amount);
      bucket.orders += 1;
      byDay.set(day, bucket);
    }

    return [...byDay.entries()].map(([date, bucket]) => ({
      date,
      revenue: bucket.revenue.toFixed(2),
      orders: bucket.orders,
    }));
  }

  async getTopItems(cafeId: number, dto: ReportsQueryDto, limit = 10) {
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
}
