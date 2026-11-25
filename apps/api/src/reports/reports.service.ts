import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ReportsQueryDto, GroupBy } from './dto/reports-query.dto.js';
import { assertReportsAllowed } from '../subscription/plan-limits.js';
import { computeTotals } from '../orders/orders.service.js';

const ZERO = new Prisma.Decimal(0);
const NEPAL_TZ = 345;
const money = (d: Prisma.Decimal) => d.toFixed(2);
const add = (m: Map<string, Prisma.Decimal>, k: string, v: Prisma.Decimal) => m.set(k, (m.get(k) ?? ZERO).plus(v));

type Ctx = { from: Date; to: Date; tz: number; q: ReportsQueryDto };

// How every sales number in here is defined (so the reports agree with each
// other and with the shift close):
//   * A sale belongs to the day its bill was fully paid (last payment time).
//   * "Gross" = item subtotal; "Net" = gross - discounts; "Collected" = sum
//     of payments (= net + service charge + VAT added on top).
//   * Voided lines are never counted as sales -- they appear only in the
//     exceptions report.
// Day boundaries use the cafe's timezone (default Nepal +5:45), fixing the
// old UTC-bucket simplification noted in CLAUDE.md.
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private async ctx(cafeId: number, q: ReportsQueryDto): Promise<Ctx> {
    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true },
    });
    assertReportsAllowed(cafe);

    const tz = q.tz ?? NEPAL_TZ;
    const todayLocal = this.localDay(new Date(), tz);
    const toDay = q.to?.slice(0, 10) ?? todayLocal;
    const fromDay = q.from?.slice(0, 10) ?? this.shiftDay(toDay, -29);
    // Local midnight -> UTC instant
    const from = new Date(Date.parse(`${fromDay}T00:00:00Z`) - tz * 60000);
    const to = new Date(Date.parse(`${toDay}T23:59:59.999Z`) - tz * 60000);
    return { from, to, tz, q };
  }

  private localDay(d: Date, tz: number) {
    return new Date(d.getTime() + tz * 60000).toISOString().slice(0, 10);
  }
  private shiftDay(day: string, delta: number) {
    return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
  }
  private bucket(d: Date, tz: number, g: GroupBy) {
    const local = new Date(d.getTime() + tz * 60000);
    const iso = local.toISOString();
    if (g === 'month') return iso.slice(0, 7);
    if (g === 'week') {
      const day = local.getUTCDay();
      const monday = new Date(local.getTime() - ((day + 6) % 7) * 86400000);
      return monday.toISOString().slice(0, 10);
    }
    return iso.slice(0, 10);
  }

  /** Paid orders whose final payment fell inside the range, with filters applied. */
  private async paidOrders(cafeId: number, c: Ctx) {
    const { q } = c;
    const orders = await this.prisma.order.findMany({
      where: {
        cafeId,
        status: 'paid',
        payments: { some: { paidAt: { gte: new Date(c.from.getTime() - 7 * 86400000), lte: c.to } } },
        ...(q.staffId ? { waiterId: q.staffId } : {}),
        ...(q.source ? { source: q.source } : {}),
        ...(q.orderType ? { orderType: q.orderType } : {}),
        ...(q.method ? { payments: { some: { method: q.method } } } : {}),
      },
      include: {
        payments: true,
        table: { select: { tableNumber: true } },
        waiter: { select: { id: true, name: true } },
        orderItems: {
          include: {
            menuItem: { select: { id: true, name: true, costPrice: true, categoryId: true, category: { select: { id: true, name: true, parentId: true } } } },
            orderItemModifiers: { include: { modifier: true } },
          },
        },
      },
    });
    return orders
      .map((o) => {
        const paidAt = o.payments.reduce((m, p) => (p.paidAt > m ? p.paidAt : m), new Date(0));
        return { ...o, paidAt };
      })
      .filter((o) => o.paidAt >= c.from && o.paidAt <= c.to);
  }

  private lineTotal(i: { price: Prisma.Decimal; quantity: number; orderItemModifiers: { modifier: { priceDelta: Prisma.Decimal } }[] }) {
    const mods = i.orderItemModifiers.reduce((s, m) => s.plus(m.modifier.priceDelta), ZERO);
    return i.price.plus(mods).times(i.quantity);
  }

  // ── 1. Overview (sales summary + trend + payment mix + hour heatmap + source) ──
  async overview(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const orders = await this.paidOrders(cafeId, c);
    const g: GroupBy = q.groupBy ?? 'day';

    let gross = ZERO, discounts = ZERO, sc = ZERO, vat = ZERO, collected = ZERO;
    const trend = new Map<string, { sales: Prisma.Decimal; bills: number }>();
    const methods = new Map<string, Prisma.Decimal>();
    const methodCount = new Map<string, number>();
    const sources = new Map<string, Prisma.Decimal>();
    const types = new Map<string, Prisma.Decimal>();
    // 7 x 24 grid, weekday (0=Sun) x local hour
    const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    for (const o of orders) {
      const sub = o.subtotal ?? o.orderItems.filter((i) => !i.voidedAt).reduce((s, i) => s.plus(this.lineTotal(i)), ZERO);
      const paid = o.payments.reduce((s, p) => s.plus(p.amount), ZERO);
      gross = gross.plus(sub);
      discounts = discounts.plus(o.discountAmount ?? 0);
      sc = sc.plus(o.serviceCharge ?? 0);
      vat = vat.plus(o.vatAmount ?? 0);
      collected = collected.plus(paid);

      const k = this.bucket(o.paidAt, c.tz, g);
      const b = trend.get(k) ?? { sales: ZERO, bills: 0 };
      trend.set(k, { sales: b.sales.plus(paid), bills: b.bills + 1 });

      for (const p of o.payments) {
        add(methods, p.method, p.amount);
        methodCount.set(p.method, (methodCount.get(p.method) ?? 0) + 1);
      }
      add(sources, o.source, paid);
      add(types, o.orderType, paid);

      const local = new Date(o.paidAt.getTime() + c.tz * 60000);
      heat[local.getUTCDay()]![local.getUTCHours()]! += 1;
    }

    const net = gross.minus(discounts);
    const [voids, cancelled, expenses] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { voidedAt: { gte: c.from, lte: c.to }, order: { cafeId } },
        select: { price: true, quantity: true },
      }),
      this.prisma.order.count({ where: { cafeId, status: 'cancelled', createdAt: { gte: c.from, lte: c.to } } }),
      this.prisma.cashMovement.aggregate({
        where: { cafeId, type: { in: ['expense', 'pay_out'] }, createdAt: { gte: c.from, lte: c.to } },
        _sum: { amount: true },
      }),
    ]);

    // Fill empty days so the chart doesn't skip gaps.
    const series: { period: string; sales: string; bills: number }[] = [];
    if (g === 'day') {
      for (let d = this.localDay(c.from, c.tz); d <= this.localDay(c.to, c.tz); d = this.shiftDay(d, 1)) {
        const b = trend.get(d);
        series.push({ period: d, sales: money(b?.sales ?? ZERO), bills: b?.bills ?? 0 });
      }
    } else {
      for (const [period, b] of [...trend.entries()].sort()) series.push({ period, sales: money(b.sales), bills: b.bills });
    }

    return {
      range: { from: this.localDay(c.from, c.tz), to: this.localDay(c.to, c.tz) },
      summary: {
        gross: money(gross),
        discounts: money(discounts),
        net: money(net),
        serviceCharge: money(sc),
        vat: money(vat),
        collected: money(collected),
        bills: orders.length,
        avgBill: money(orders.length ? collected.dividedBy(orders.length) : ZERO),
        voidCount: voids.length,
        voidAmount: money(voids.reduce((s, v) => s.plus(v.price.times(v.quantity)), ZERO)),
        cancelledOrders: cancelled,
        expenses: money(expenses._sum.amount ?? ZERO),
      },
      series,
      paymentMethods: [...methods.entries()].map(([method, amount]) => ({ method, amount: money(amount), count: methodCount.get(method) ?? 0 })),
      sources: [...sources.entries()].map(([source, amount]) => ({ source, amount: money(amount) })),
      orderTypes: [...types.entries()].map(([type, amount]) => ({ type, amount: money(amount) })),
      heatmap: heat,
    };
  }

  // ── 2/3. Sales by item & by category (with cost + margin when known) ──
  async items(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const orders = await this.paidOrders(cafeId, c);

    // Recipe cost per menu item (current average cost of ingredients).
    const recipes = await this.prisma.recipeLine.findMany({
      where: { menuItem: { cafeId } },
      include: { stockItem: { select: { avgCost: true } } },
    });
    const recipeCost = new Map<number, Prisma.Decimal>();
    for (const r of recipes) {
      recipeCost.set(r.menuItemId, (recipeCost.get(r.menuItemId) ?? ZERO).plus(r.quantity.times(r.stockItem.avgCost)));
    }

    type Row = { id: number; name: string; category: string; qty: number; sales: Prisma.Decimal; cost: Prisma.Decimal | null };
    const byItem = new Map<number, Row>();
    const byCat = new Map<string, { name: string; qty: number; sales: Prisma.Decimal }>();

    for (const o of orders) {
      // Spread a bill-level discount proportionally across its lines so item
      // sales add up to net sales.
      const live = o.orderItems.filter((i) => !i.voidedAt);
      const sub = live.reduce((s, i) => s.plus(this.lineTotal(i)), ZERO);
      const factor = sub.gt(0) && o.discountAmount ? sub.minus(o.discountAmount).dividedBy(sub) : new Prisma.Decimal(1);
      for (const i of live) {
        if (q.categoryId && i.menuItem.categoryId !== q.categoryId && i.menuItem.category.parentId !== q.categoryId) continue;
        const sales = this.lineTotal(i).times(factor);
        const unitCost = recipeCost.get(i.menuItem.id) ?? i.menuItem.costPrice ?? null;
        const row = byItem.get(i.menuItem.id) ?? {
          id: i.menuItem.id, name: i.menuItem.name, category: i.menuItem.category.name, qty: 0, sales: ZERO, cost: unitCost ? ZERO : null,
        };
        row.qty += i.quantity;
        row.sales = row.sales.plus(sales);
        if (unitCost && row.cost) row.cost = row.cost.plus(unitCost.times(i.quantity));
        byItem.set(i.menuItem.id, row);

        const cat = byCat.get(i.menuItem.category.name) ?? { name: i.menuItem.category.name, qty: 0, sales: ZERO };
        cat.qty += i.quantity;
        cat.sales = cat.sales.plus(sales);
        byCat.set(cat.name, cat);
      }
    }

    const totalSales = [...byItem.values()].reduce((s, r) => s.plus(r.sales), ZERO);
    return {
      items: [...byItem.values()]
        .sort((a, b) => b.sales.comparedTo(a.sales))
        .map((r) => ({
          id: r.id, name: r.name, category: r.category, qty: r.qty, sales: money(r.sales),
          share: totalSales.gt(0) ? r.sales.dividedBy(totalSales).times(100).toFixed(1) : '0.0',
          cost: r.cost ? money(r.cost) : null,
          margin: r.cost && r.sales.gt(0) ? r.sales.minus(r.cost).dividedBy(r.sales).times(100).toFixed(1) : null,
        })),
      categories: [...byCat.values()]
        .sort((a, b) => b.sales.comparedTo(a.sales))
        .map((r) => ({ name: r.name, qty: r.qty, sales: money(r.sales) })),
    };
  }

  // ── 5. Sales by staff ──
  async staff(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const orders = await this.paidOrders(cafeId, c);
    const users = await this.prisma.user.findMany({ where: { cafeId }, select: { id: true, name: true, role: true } });
    const name = (id: number | null) => users.find((u) => u.id === id)?.name ?? (id == null ? 'QR / customer' : `#${id}`);

    const waiters = new Map<string, { bills: number; sales: Prisma.Decimal; items: number }>();
    const cashiers = new Map<string, { payments: number; amount: Prisma.Decimal }>();
    for (const o of orders) {
      const paid = o.payments.reduce((s, p) => s.plus(p.amount), ZERO);
      const w = waiters.get(name(o.waiterId)) ?? { bills: 0, sales: ZERO, items: 0 };
      w.bills += 1;
      w.sales = w.sales.plus(paid);
      w.items += o.orderItems.filter((i) => !i.voidedAt).reduce((s, i) => s + i.quantity, 0);
      waiters.set(name(o.waiterId), w);
      for (const p of o.payments) {
        const k = name(p.receivedById);
        const cs = cashiers.get(k) ?? { payments: 0, amount: ZERO };
        cs.payments += 1;
        cs.amount = cs.amount.plus(p.amount);
        cashiers.set(k, cs);
      }
    }
    return {
      waiters: [...waiters.entries()].map(([n, w]) => ({
        name: n, bills: w.bills, items: w.items, sales: money(w.sales), avgBill: money(w.sales.dividedBy(w.bills)),
      })).sort((a, b) => Number(b.sales) - Number(a.sales)),
      cashiers: [...cashiers.entries()].map(([n, cs]) => ({ name: n, payments: cs.payments, amount: money(cs.amount) })),
    };
  }

  // ── 10. Sales register (bill-by-bill) -- what the accountant asks for ──
  async bills(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const [paid, cancelled] = await Promise.all([
      this.paidOrders(cafeId, c),
      this.prisma.order.findMany({
        where: { cafeId, status: 'cancelled', createdAt: { gte: c.from, lte: c.to }, ...(q.staffId ? { waiterId: q.staffId } : {}) },
        include: { table: { select: { tableNumber: true } }, waiter: { select: { name: true } } },
      }),
    ]);
    const rows = [
      ...paid.map((o) => ({
        orderId: o.id,
        billNumber: o.billNumber,
        date: o.paidAt,
        table: o.table.tableNumber,
        waiter: o.waiter?.name ?? 'QR',
        source: o.source,
        subtotal: money(o.subtotal ?? ZERO),
        discount: money(o.discountAmount ?? ZERO),
        serviceCharge: money(o.serviceCharge ?? ZERO),
        vat: money(o.vatAmount ?? ZERO),
        total: money(o.total ?? ZERO),
        methods: [...new Set(o.payments.map((p) => p.method))].join(' + '),
        status: 'paid' as const,
        note: o.discountReason ?? null,
      })),
      ...cancelled.map((o) => ({
        orderId: o.id,
        billNumber: o.billNumber,
        date: o.createdAt,
        table: o.table.tableNumber,
        waiter: o.waiter?.name ?? 'QR',
        source: o.source,
        subtotal: '0.00', discount: '0.00', serviceCharge: '0.00', vat: '0.00', total: '0.00',
        methods: '',
        status: 'cancelled' as const,
        note: o.cancelReason ?? null,
      })),
    ];
    return rows.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }

  // ── 8. Discounts, voids, cancellations, reopened bills (anti-leak) ──
  async exceptions(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        cafeId,
        createdAt: { gte: c.from, lte: c.to },
        action: { in: ['discount.apply', 'discount.remove', 'item.void', 'order.cancel', 'bill.reopen', 'shift.close', 'stock.wastage', 'stock.breakage', 'stock.staff_use', 'stock.count', 'cash.pay_out', 'cash.expense', 'cash.pay_in'] },
        ...(q.staffId ? { actorId: q.staffId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const byStaff = new Map<string, { discounts: number; voids: number; cancels: number; reopens: number }>();
    for (const l of logs) {
      const k = l.actorName ?? 'Unknown';
      const s = byStaff.get(k) ?? { discounts: 0, voids: 0, cancels: 0, reopens: 0 };
      if (l.action === 'discount.apply') s.discounts++;
      if (l.action === 'item.void') s.voids++;
      if (l.action === 'order.cancel') s.cancels++;
      if (l.action === 'bill.reopen') s.reopens++;
      byStaff.set(k, s);
    }

    const discounted = await this.prisma.order.findMany({
      where: { cafeId, status: 'paid', discountAmount: { gt: 0 }, payments: { some: { paidAt: { gte: c.from, lte: c.to } } } },
      select: { discountAmount: true, discountReason: true },
    });
    const byReason = new Map<string, { count: number; amount: Prisma.Decimal }>();
    for (const d of discounted) {
      const k = d.discountReason ?? '—';
      const r = byReason.get(k) ?? { count: 0, amount: ZERO };
      byReason.set(k, { count: r.count + 1, amount: r.amount.plus(d.discountAmount ?? 0) });
    }

    return {
      log: logs.map((l) => ({ id: l.id, at: l.createdAt, actor: l.actorName, action: l.action, entityId: l.entityId, details: l.details })),
      byStaff: [...byStaff.entries()].map(([name, s]) => ({ name, ...s })),
      discountReasons: [...byReason.entries()].map(([reason, r]) => ({ reason, count: r.count, amount: money(r.amount) })),
    };
  }

  // ── 9. Shifts / day-end ──
  async shifts(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const shifts = await this.prisma.shift.findMany({
      where: { cafeId, openedAt: { gte: c.from, lte: c.to } },
      orderBy: { openedAt: 'desc' },
      include: { openedBy: { select: { name: true } }, closedBy: { select: { name: true } } },
    });
    return shifts.map((s) => ({
      id: s.id, openedAt: s.openedAt, closedAt: s.closedAt, openedBy: s.openedBy.name, closedBy: s.closedBy?.name ?? null,
      openingCash: money(s.openingCash), expectedCash: s.expectedCash ? money(s.expectedCash) : null,
      countedCash: s.countedCash ? money(s.countedCash) : null, difference: s.difference ? money(s.difference) : null,
    }));
  }

  // ── 11. Purchases & expenses ──
  async purchases(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const [purchases, expenses] = await Promise.all([
      this.prisma.purchase.findMany({
        where: { cafeId, purchasedAt: { gte: c.from, lte: c.to } },
        include: { supplier: true, lines: { include: { stockItem: { select: { name: true, unit: true } } } } },
        orderBy: { purchasedAt: 'desc' },
      }),
      this.prisma.cashMovement.findMany({
        where: { cafeId, type: { in: ['expense', 'pay_out'] }, createdAt: { gte: c.from, lte: c.to } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const bySupplier = new Map<string, { count: number; total: Prisma.Decimal }>();
    const byItem = new Map<string, { qty: Prisma.Decimal; unit: string; total: Prisma.Decimal }>();
    for (const p of purchases) {
      const k = p.supplier?.name ?? 'No supplier';
      const s = bySupplier.get(k) ?? { count: 0, total: ZERO };
      bySupplier.set(k, { count: s.count + 1, total: s.total.plus(p.total) });
      for (const l of p.lines) {
        const r = byItem.get(l.stockItem.name) ?? { qty: ZERO, unit: l.stockItem.unit, total: ZERO };
        byItem.set(l.stockItem.name, { qty: r.qty.plus(l.quantity), unit: r.unit, total: r.total.plus(l.lineTotal) });
      }
    }
    const byCategory = new Map<string, Prisma.Decimal>();
    for (const e of expenses) add(byCategory, e.category ?? 'Other', e.amount);

    return {
      totalPurchases: money(purchases.reduce((s, p) => s.plus(p.total), ZERO)),
      totalExpenses: money(expenses.reduce((s, e) => s.plus(e.amount), ZERO)),
      bySupplier: [...bySupplier.entries()].map(([name, s]) => ({ name, count: s.count, total: money(s.total) })),
      byItem: [...byItem.entries()].map(([name, r]) => ({ name, qty: r.qty.toFixed(2), unit: r.unit, total: money(r.total) })),
      expensesByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount: money(amount) })),
      purchases: purchases.map((p) => ({
        id: p.id, date: p.purchasedAt, supplier: p.supplier?.name ?? null, billRef: p.billRef, total: money(p.total),
        lines: p.lines.map((l) => `${l.stockItem.name} ${l.quantity.toFixed(2)} ${l.stockItem.unit}`).join(', '),
      })),
      expenses: expenses.map((e) => ({ id: e.id, date: e.createdAt, type: e.type, category: e.category, amount: money(e.amount), note: e.note })),
    };
  }

  // ── Stock on hand + consumption (opening + in - out = closing) ──
  async stock(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const [items, moves] = await Promise.all([
      this.prisma.stockItem.findMany({ where: { cafeId }, orderBy: { name: 'asc' } }),
      this.prisma.stockMovement.groupBy({
        by: ['stockItemId', 'type'],
        where: { cafeId, createdAt: { gte: c.from, lte: c.to } },
        _sum: { quantity: true },
      }),
    ]);
    let totalValue = ZERO;
    const rows = items.map((i) => {
      const m = (t: string) => moves.find((x) => x.stockItemId === i.id && x.type === t)?._sum.quantity ?? ZERO;
      const value = Prisma.Decimal.max(i.currentQty, 0).times(i.avgCost);
      totalValue = totalValue.plus(value);
      const used = m('sale').plus(m('staff_use')).negated();
      const lost = m('wastage').plus(m('breakage')).negated();
      return {
        id: i.id, name: i.name, kind: i.kind, unit: i.unit,
        onHand: i.currentQty.toFixed(2), avgCost: i.avgCost.toFixed(2), value: money(value),
        purchased: m('purchase').toFixed(2), used: used.toFixed(2), lost: lost.toFixed(2),
        lostValue: money(lost.times(i.avgCost)), countVariance: m('count').toFixed(2),
        status: i.currentQty.lte(0) ? 'out' : i.currentQty.lte(i.lowStockThreshold) ? 'low' : 'ok',
      };
    });
    return { totalValue: money(totalValue), items: rows };
  }

  // ── Simple profit & loss ──
  async profit(cafeId: number, q: ReportsQueryDto) {
    const c = await this.ctx(cafeId, q);
    const [ov, it, moves, expenses] = await Promise.all([
      this.overview(cafeId, q),
      this.items(cafeId, q),
      this.prisma.stockMovement.findMany({
        where: { cafeId, createdAt: { gte: c.from, lte: c.to }, type: { in: ['wastage', 'breakage', 'staff_use'] } },
        select: { quantity: true, unitCost: true },
      }),
      this.prisma.cashMovement.aggregate({
        where: { cafeId, type: { in: ['expense', 'pay_out'] }, createdAt: { gte: c.from, lte: c.to } },
        _sum: { amount: true },
      }),
    ]);
    const cogs = it.items.reduce((s, r) => s.plus(r.cost ?? 0), ZERO);
    const losses = moves.reduce((s, m) => s.plus(m.quantity.negated().times(m.unitCost ?? 0)), ZERO);
    const net = new Prisma.Decimal(ov.summary.net);
    const exp = expenses._sum.amount ?? ZERO;
    const costedShare = it.items.length ? it.items.filter((i) => i.cost).length / it.items.length : 0;
    return {
      netSales: money(net),
      cogs: money(cogs),
      grossProfit: money(net.minus(cogs)),
      stockLosses: money(losses),
      expenses: money(exp),
      operatingProfit: money(net.minus(cogs).minus(losses).minus(exp)),
      costCoverage: Math.round(costedShare * 100), // % of sold items with a known cost
    };
  }

  /** Kept for any caller of the old endpoint name. */
  async getDailyReport(cafeId: number, date: string) {
    return this.overview(cafeId, { from: date, to: date });
  }
}

