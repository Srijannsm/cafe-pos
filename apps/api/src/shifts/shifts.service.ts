import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { CashMovementDto, CloseShiftDto, ListQueryDto, OpenShiftDto } from './shifts.dto.js';

const ZERO = new Prisma.Decimal(0);
type Actor = Pick<CurrentUserPayload, 'userId' | 'name'>;

// A shift is one opening-to-closing period of the cash drawer. Closing it
// compares what *should* be in the drawer (opening cash + cash sales +
// pay-ins - pay-outs/expenses) to what was actually counted. That single
// "difference" number is the most useful anti-leak signal a small cafe has.
@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async summarize(shiftId: number) {
    const shift = await this.prisma.shift.findUniqueOrThrow({
      where: { id: shiftId },
      include: {
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        payments: { select: { amount: true, method: true, orderId: true } },
        cashMovements: { orderBy: { createdAt: 'asc' } },
      },
    });

    const byMethod: Record<string, string> = {};
    let cashSales = ZERO;
    let totalSales = ZERO;
    for (const p of shift.payments) {
      byMethod[p.method] = new Prisma.Decimal(byMethod[p.method] ?? 0).plus(p.amount).toFixed(2);
      totalSales = totalSales.plus(p.amount);
      if (p.method === 'cash') cashSales = cashSales.plus(p.amount);
    }
    let payIns = ZERO;
    let payOuts = ZERO;
    for (const m of shift.cashMovements) {
      if (m.type === 'pay_in') payIns = payIns.plus(m.amount);
      else payOuts = payOuts.plus(m.amount);
    }
    const expectedCash = shift.openingCash.plus(cashSales).plus(payIns).minus(payOuts);

    return {
      id: shift.id,
      openedAt: shift.openedAt,
      openedBy: shift.openedBy.name,
      closedAt: shift.closedAt,
      closedBy: shift.closedBy?.name ?? null,
      openingCash: shift.openingCash.toFixed(2),
      cashSales: cashSales.toFixed(2),
      totalSales: totalSales.toFixed(2),
      salesByMethod: byMethod,
      billsPaid: new Set(shift.payments.map((p) => p.orderId)).size,
      payIns: payIns.toFixed(2),
      payOuts: payOuts.toFixed(2),
      expectedCash: (shift.expectedCash ?? expectedCash).toFixed(2),
      countedCash: shift.countedCash?.toFixed(2) ?? null,
      difference: shift.difference?.toFixed(2) ?? null,
      note: shift.note,
      movements: shift.cashMovements.map((m) => ({
        id: m.id, type: m.type, category: m.category, amount: m.amount.toFixed(2), note: m.note, createdAt: m.createdAt,
      })),
    };
  }

  async current(cafeId: number) {
    const open = await this.prisma.shift.findFirst({ where: { cafeId, closedAt: null } });
    return open ? this.summarize(open.id) : null;
  }

  async open(cafeId: number, dto: OpenShiftDto, actor: Actor) {
    // Serialise "open shift" per cafe so two cashiers can't open two drawers at once.
    const shift = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cafes WHERE id = ${cafeId} FOR UPDATE`;
      const existing = await tx.shift.findFirst({ where: { cafeId, closedAt: null } });
      if (existing) throw new BadRequestException('A shift is already open');
      return tx.shift.create({ data: { cafeId, openedById: actor.userId, openingCash: dto.openingCash } });
    });
    return this.summarize(shift.id);
  }

  async addMovement(cafeId: number, dto: CashMovementDto, actor: Actor) {
    const open = await this.prisma.shift.findFirst({ where: { cafeId, closedAt: null } });
    // Expenses can be logged without an open drawer (paid from the owner's
    // pocket, say); pay-in/pay-out are drawer operations and need a shift.
    if (!open && dto.type !== 'expense') {
      throw new BadRequestException('Open a shift before moving cash in or out of the drawer');
    }
    const movement = await this.prisma.cashMovement.create({
      data: {
        cafeId,
        shiftId: open?.id ?? null,
        type: dto.type,
        amount: dto.amount,
        category: dto.category?.trim() || null,
        note: dto.note?.trim() || null,
        createdById: actor.userId,
      },
    });
    await this.audit.log(cafeId, actor, `cash.${dto.type}`, 'cashMovement', movement.id, {
      amount: dto.amount, category: dto.category, note: dto.note,
    });
    return movement;
  }

  async close(cafeId: number, dto: CloseShiftDto, actor: Actor) {
    const open = await this.prisma.shift.findFirst({ where: { cafeId, closedAt: null } });
    if (!open) throw new BadRequestException('No shift is open');
    const summary = await this.summarize(open.id);
    const expected = new Prisma.Decimal(summary.expectedCash);
    const difference = new Prisma.Decimal(dto.countedCash).minus(expected);

    await this.prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id: open.id },
        data: {
          closedAt: new Date(),
          closedById: actor.userId,
          expectedCash: expected,
          countedCash: dto.countedCash,
          difference,
          note: dto.note?.trim() || null,
        },
      });
      await this.audit.log(cafeId, actor, 'shift.close', 'shift', open.id, {
        expected: expected.toFixed(2), counted: dto.countedCash, difference: difference.toFixed(2),
      }, tx);
    });
    return this.summarize(open.id);
  }

  async get(cafeId: number, id: number) {
    const shift = await this.prisma.shift.findFirst({ where: { id, cafeId } });
    if (!shift) throw new NotFoundException('Shift not found');
    return this.summarize(id);
  }

  async list(cafeId: number, q: ListQueryDto) {
    const shifts = await this.prisma.shift.findMany({
      where: {
        cafeId,
        ...(q.from || q.to
          ? { openedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: endOfDay(q.to) } : {}) } }
          : {}),
      },
      orderBy: { openedAt: 'desc' },
      take: Math.min(q.take ?? 60, 200),
      select: { id: true },
    });
    return Promise.all(shifts.map((s) => this.summarize(s.id)));
  }

  listExpenses(cafeId: number, q: ListQueryDto) {
    return this.prisma.cashMovement.findMany({
      where: {
        cafeId,
        type: { in: ['expense', 'pay_out'] },
        ...(q.from || q.to
          ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: endOfDay(q.to) } : {}) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
}

function endOfDay(s: string) {
  const d = new Date(s);
  if (s.length <= 10) d.setUTCHours(23, 59, 59, 999);
  return d;
}
