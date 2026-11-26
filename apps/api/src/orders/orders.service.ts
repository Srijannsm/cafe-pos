import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AddOrderDto } from './dto/add-item.dto.js';
import { AddPaymentDto, RecordPaymentDto } from './dto/record-payment.dto.js';
import { UpdateOrderNotesDto } from './dto/update-order-notes.dto.js';
import { ApplyDiscountDto } from './dto/billing.dto.js';
import { ListBillsDto } from './dto/list-bills.dto.js';
import { Prisma, OrderStatus, OrderSource } from '../generated/prisma/client.js';
import { OrdersGateway } from './orders.gateway.js';
import { NotificationsService } from './notifications.service.js';
import { AuditService } from '../audit/audit.service.js';
import { assertNotOverdue, hasFeature } from '../subscription/plan-limits.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';

type Actor = Pick<CurrentUserPayload, 'userId' | 'name' | 'role'> | null;
const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
const ZERO = D(0);

// Everything the bill needs, in display order: subtotal -> discount -> net
// -> service charge -> VAT -> total. Kept in one pure function so the
// estimate the cashier sees and the bill that gets frozen can never drift.
export type BillTotals = {
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  serviceCharge: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  total: Prisma.Decimal;
};

type LineForTotals = {
  price: Prisma.Decimal;
  quantity: number;
  voidedAt: Date | null;
  orderItemModifiers: { modifier: { priceDelta: Prisma.Decimal } }[];
};

export function computeTotals(
  lines: LineForTotals[],
  discount: { type: 'percent' | 'flat' | null; value: Prisma.Decimal | null },
  cafe: { vatEnabled: boolean; vatRate: Prisma.Decimal; serviceChargeRate: Prisma.Decimal; pricesIncludeVat: boolean },
): BillTotals {
  let subtotal = ZERO;
  for (const line of lines) {
    if (line.voidedAt) continue; // voided lines stay on record but never get charged
    const mods = line.orderItemModifiers.reduce((s, m) => s.plus(m.modifier.priceDelta), ZERO);
    subtotal = subtotal.plus(line.price.plus(mods).times(line.quantity));
  }

  let discountAmount = ZERO;
  if (discount.type && discount.value && discount.value.gt(0)) {
    discountAmount =
      discount.type === 'percent'
        ? subtotal.times(Prisma.Decimal.min(discount.value, 100)).dividedBy(100)
        : Prisma.Decimal.min(discount.value, subtotal);
    discountAmount = discountAmount.toDecimalPlaces(2);
  }

  const net = subtotal.minus(discountAmount);
  const serviceCharge = net.times(cafe.serviceChargeRate).dividedBy(100).toDecimalPlaces(2);
  const taxable = net.plus(serviceCharge);

  let vatAmount = ZERO;
  let total = taxable;
  if (cafe.vatEnabled) {
    if (cafe.pricesIncludeVat) {
      // Menu prices already include VAT -> back-calculate the VAT share.
      vatAmount = taxable.times(cafe.vatRate).dividedBy(D(100).plus(cafe.vatRate)).toDecimalPlaces(2);
    } else {
      vatAmount = taxable.times(cafe.vatRate).dividedBy(100).toDecimalPlaces(2);
      total = taxable.plus(vatAmount);
    }
  }

  return { subtotal, discountAmount, serviceCharge, vatAmount, total: total.toDecimalPlaces(2) };
}

const ITEM_INCLUDE = {
  menuItem: true,
  orderItemModifiers: { include: { modifier: true } },
} satisfies Prisma.OrderItemInclude;

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private ordersGateway: OrdersGateway,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  async findAll(cafeId: number, status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: { cafeId, ...(status ? { status } : {}) },
      include: {
        orderItems: { include: ITEM_INCLUDE, orderBy: { id: 'asc' } },
        table: true,
        waiter: { select: { id: true, name: true } },
        payments: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(cafeId: number, dto: CreateOrderDto, source: OrderSource = 'staff') {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: dto.tableId, cafeId },
    });

    if (!table) {
      throw new NotFoundException(`Table ${dto.tableId} does not exist`);
    }

    // Auto-heal stale 'occupied' status: if no active order exists for this table, treat it as free
    if (table.status !== 'free') {
      const existingActiveOrder = await this.prisma.order.findFirst({
        where: { tableId: table.id, status: { notIn: ['paid', 'cancelled'] } },
      });
      if (existingActiveOrder) {
        throw new BadRequestException(`Table ${table.tableNumber} is not free`);
      }
      await this.prisma.restaurantTable.update({
        where: { id: table.id },
        data: { status: 'free' },
      });
    }

    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true },
    });
    assertNotOverdue(cafe);

    // A waiter id from another cafe should never be assignable here.
    const waiter = await this.prisma.user.findFirst({
      where: { id: dto.waiterId, cafeId },
    });

    if (!waiter) {
      throw new NotFoundException(`Waiter ${dto.waiterId} does not exist`);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      // Lock the table row so two waiters tapping the same free table at once
      // can't both open an order on it -- the second waits, then sees the first.
      await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${dto.tableId} FOR UPDATE`;
      const active = await tx.order.findFirst({
        where: { tableId: dto.tableId, status: { notIn: ['paid', 'cancelled'] } },
        select: { id: true },
      });
      if (active) throw new BadRequestException(`Table ${table.tableNumber} is not free`);

      const created = await tx.order.create({
        data: {
          cafeId,
          tableId: dto.tableId,
          waiterId: dto.waiterId,
          orderType: dto.orderType,
          source,
          notes: dto.notes?.trim() || null,
        },
      });

      await tx.restaurantTable.update({
        where: { id: dto.tableId },
        data: { status: 'occupied' },
      });

      return created;
    });

    this.ordersGateway.emitFloorChanged(cafeId);
    return order;
  }

  // Items can join an order any time before the bill is generated (people
  // order in rounds). Once billed, the bill has to be reopened first.
  private static readonly ADDABLE_STATUSES: OrderStatus[] = ['pending', 'preparing', 'served'];

  async addItem(cafeId: number, orderId: number, dto: AddOrderDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    if (!OrdersService.ADDABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        order.status === 'billed'
          ? 'This bill is already printed -- reopen it before adding items'
          : `Cannot add items to an order with status "${order.status}"`,
      );
    }

    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: dto.menuItemId, cafeId },
      include: { modifiers: { select: { id: true } } },
    });

    if (!menuItem) {
      throw new NotFoundException(`Menu item ${dto.menuItemId} does not exist`);
    }
    if (!menuItem.isAvailable) {
      throw new BadRequestException(`"${menuItem.name}" is sold out`);
    }

    // Modifiers must belong to this item -- otherwise a crafted request
    // could attach another item's (or another cafe's) priced modifier.
    const allowedModifierIds = new Set(menuItem.modifiers.map((m) => m.id));
    const modifierIds = [...new Set(dto.modifierIds ?? [])];
    if (modifierIds.some((id) => !allowedModifierIds.has(id))) {
      throw new BadRequestException('One of the selected options does not belong to this item');
    }

    const note = dto.note?.trim() || null;
    const modKey = [...modifierIds].sort((a, b) => a - b).join(',');

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialise adds on this order so two quick taps can't both decide
      // "no matching line yet" and create duplicates.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

      // Re-check finished-goods stock inside the transaction (see CLAUDE.md
      // "Inventory tracking") so two waiters can't both take the last one.
      if (menuItem.trackStock) {
        const current = await tx.menuItem.findUniqueOrThrow({ where: { id: menuItem.id } });
        if (current.stockQuantity < dto.quantity) {
          throw new BadRequestException(
            `Only ${current.stockQuantity} of "${current.name}" left in stock`,
          );
        }
        await tx.menuItem.update({
          where: { id: menuItem.id },
          data: { stockQuantity: { decrement: dto.quantity } },
        });
      }

      // Tapping "French Toast" three times should give one line "3x French
      // Toast", not three "1x" lines -- on the cart, the kitchen ticket and
      // the bill. Only merge into a line that is identical in every way that
      // matters: same item, same price snapshot, same options, same note, and
      // not yet sent (a round the kitchen already has is never changed).
      const candidates = await tx.orderItem.findMany({
        where: { orderId, menuItemId: dto.menuItemId, sentToKitchen: false, voidedAt: null, note, price: menuItem.price },
        include: { orderItemModifiers: { select: { modifierId: true } } },
      });
      const same = candidates.find(
        (c) => c.orderItemModifiers.map((m) => m.modifierId).sort((a, b) => a - b).join(',') === modKey,
      );
      if (same) {
        await tx.orderItem.update({ where: { id: same.id }, data: { quantity: { increment: dto.quantity } } });
        if (order.status === 'served') {
          await tx.order.update({ where: { id: orderId }, data: { status: 'pending' } });
        }
        return tx.orderItem.findUnique({
          where: { id: same.id },
          include: { orderItemModifiers: { include: { modifier: true } } },
        });
      }

      const orderItem = await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: dto.menuItemId,
          quantity: dto.quantity,
          price: menuItem.price, // snapshot the CURRENT price at order time
          station: menuItem.station, // snapshot so moving an item to another station later doesn't reroute old tickets
          note,
        },
      });

      if (modifierIds.length > 0) {
        await tx.orderItemModifier.createMany({
          data: modifierIds.map((modifierId) => ({ orderItemId: orderItem.id, modifierId })),
        });
      }

      // A new round on an order the kitchen already finished goes back to
      // "pending" so the waiter reviews it and explicitly sends it.
      if (order.status === 'served') {
        await tx.order.update({ where: { id: orderId }, data: { status: 'pending' } });
      }

      return tx.orderItem.findUnique({
        where: { id: orderItem.id },
        include: { orderItemModifiers: { include: { modifier: true } } },
      });
    });

    this.ordersGateway.emitFloorChanged(cafeId);
    return result;
  }

  async sendToKitchen(cafeId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: {
        orderItems: { include: { menuItem: { select: { name: true } } } },
        table: { select: { tableNumber: true } },
        waiter: { select: { name: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    if (order.status !== 'pending' && order.status !== 'preparing') {
      throw new BadRequestException(
        `Order ${orderId} cannot be sent to kitchen from status "${order.status}"`,
      );
    }

    const pendingItems = order.orderItems.filter((i) => i.status === 'pending' && !i.sentToKitchen && !i.voidedAt);

    if (pendingItems.length === 0) {
      throw new BadRequestException('No new items to send -- everything is already in the kitchen');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // One timestamp for the whole batch = one "round" on the kitchen screen.
      await tx.orderItem.updateMany({
        where: { id: { in: pendingItems.map((i) => i.id) } },
        data: { sentToKitchen: true, sentAt: new Date() },
      });
      return tx.order.update({ where: { id: orderId }, data: { status: 'preparing' } });
    });

    const count = pendingItems.reduce((n, i) => n + i.quantity, 0);
    this.ordersGateway.emitOrderSentToKitchen(cafeId, { orderId: updated.id, tableNumber: order.table?.tableNumber, items: count });
    await this.notifications?.notify(cafeId, 'sent', {
      orderId: updated.id,
      tableNumber: order.table?.tableNumber,
      data: { count, items: pendingItems.map((i) => `${i.quantity}x ${i.menuItem?.name ?? 'Item'}`), waiter: order.waiter?.name ?? null },
    });
    return updated;
  }

  async markItemReady(cafeId: number, orderItemId: number) {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { cafeId } },
      include: { menuItem: { select: { name: true } }, order: { select: { table: { select: { tableNumber: true } }, waiter: { select: { name: true } } } } },
    });

    if (!orderItem) {
      throw new NotFoundException(`Order item ${orderItemId} does not exist`);
    }
    if (orderItem.voidedAt) {
      throw new BadRequestException('This item was voided');
    }
    if (orderItem.status !== 'pending') {
      throw new BadRequestException(
        `Order item ${orderItemId} cannot be marked ready from status "${orderItem.status}"`,
      );
    }

    const updated = await this.prisma.orderItem.update({
      where: { id: orderItemId },
      data: { status: 'ready', readyAt: new Date() },
    });

    this.ordersGateway.emitOrderItemReady(cafeId, {
      orderId: updated.orderId,
      orderItemId: updated.id,
      tableNumber: orderItem.order?.table?.tableNumber,
      items: [`${orderItem.quantity}x ${orderItem.menuItem?.name ?? 'Item'}`],
    });
    this.ordersGateway.emitFloorChanged(cafeId);
    await this.notifications?.notify(cafeId, 'ready', {
      orderId: updated.orderId,
      tableNumber: orderItem.order?.table?.tableNumber,
      data: {
        items: [`${orderItem.quantity}x ${orderItem.menuItem?.name ?? 'Item'}`],
        waiter: orderItem.order?.waiter?.name ?? null,
        cookSecs: orderItem.sentAt ? Math.round((Date.now() - orderItem.sentAt.getTime()) / 1000) : null,
      },
    });
    return updated;
  }

  // KDS "recall": a bumped item goes back onto the board.
  async recallItem(cafeId: number, orderItemId: number) {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { cafeId, status: { in: ['preparing'] } } },
      include: { menuItem: { select: { name: true } }, order: { select: { table: { select: { tableNumber: true } } } } },
    });
    if (!orderItem || orderItem.status !== 'ready') {
      throw new BadRequestException('Only a ready item on an open ticket can be recalled');
    }
    const updated = await this.prisma.orderItem.update({ where: { id: orderItemId }, data: { status: 'pending', readyAt: null } });
    // Its own event (not order.sentToKitchen): a recall isn't a new order,
    // so it must not show up as "sent to kitchen" in notifications.
    // The waiter must hear about this: they may be about to serve it.
    this.ordersGateway.emitCafe(cafeId, 'order.itemRecalled', {
      orderId: updated.orderId,
      orderItemId,
      tableNumber: orderItem.order?.table?.tableNumber,
      items: [`${orderItem.quantity}x ${orderItem.menuItem?.name ?? 'Item'}`],
    });
    this.ordersGateway.emitFloorChanged(cafeId);
    await this.notifications?.notify(cafeId, 'recalled', {
      orderId: updated.orderId,
      tableNumber: orderItem.order?.table?.tableNumber,
      data: { items: [`${orderItem.quantity}x ${orderItem.menuItem?.name ?? 'Item'}`] },
    });
    return updated;
  }

  async serve(cafeId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: { orderItems: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }
    if (order.status !== 'preparing') {
      throw new BadRequestException(`Order ${orderId} cannot be served from status "${order.status}"`);
    }

    const notReady = order.orderItems.filter((item) => item.status === 'pending' && !item.voidedAt);
    if (notReady.length > 0) {
      throw new BadRequestException(
        `${notReady.length} item(s) are still being prepared in the kitchen`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({ where: { orderId, status: 'ready' }, data: { status: 'served' } });
      return tx.order.update({ where: { id: orderId }, data: { status: 'served' } });
    });
    this.ordersGateway.emitFloorChanged(cafeId);
    return result;
  }

  // Cancelling a whole order. Before the kitchen sees it anyone can cancel;
  // after that it's a money-sensitive action -- admin only, reason required,
  // written to the audit log. Paid orders can never be cancelled.
  async cancel(cafeId: number, orderId: number, actor: Actor, reason?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: { orderItems: { include: { menuItem: true } }, payments: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }
    if (order.status === 'paid' || order.status === 'cancelled') {
      throw new BadRequestException(`Order is already ${order.status}`);
    }
    if (order.payments.length > 0) {
      throw new BadRequestException('This bill already has payments recorded and cannot be cancelled');
    }
    if (order.status !== 'pending') {
      if (actor?.role !== 'admin') {
        throw new ForbiddenException('Only an admin can cancel an order the kitchen has already started');
      }
      if (!reason?.trim()) {
        throw new BadRequestException('A reason is required to cancel this order');
      }
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      for (const item of order.orderItems) {
        if (item.menuItem.trackStock && !item.voidedAt) {
          await tx.menuItem.update({
            where: { id: item.menuItemId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'cancelled', cancelReason: reason?.trim() || null },
      });

      await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'free' } });
      await tx.restaurantTable.updateMany({
        where: { mergedIntoId: order.tableId },
        data: { mergedIntoId: null, status: 'free' },
      });

      if (order.status !== 'pending') {
        await this.audit.log(cafeId, actor, 'order.cancel', 'order', orderId, {
          reason, status: order.status,
        }, tx);
      }
      return updated;
    });

    this.ordersGateway.emitFloorChanged(cafeId);
    return cancelled;
  }

  // ── Billing ─────────────────────────────────────────────────────────

  private async loadForBilling(cafeId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: {
        orderItems: { include: { orderItemModifiers: { include: { modifier: true } } } },
        payments: true,
        cafe: { select: { vatEnabled: true, vatRate: true, serviceChargeRate: true, pricesIncludeVat: true } },
      },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} does not exist`);
    return order;
  }

  private totalsFor(order: Awaited<ReturnType<OrdersService['loadForBilling']>>) {
    return computeTotals(
      order.orderItems,
      { type: order.discountType, value: order.discountValue },
      order.cafe,
    );
  }

  /** Live estimate (before the bill is printed) -- what the cashier sees. */
  async estimate(cafeId: number, orderId: number) {
    const order = await this.loadForBilling(cafeId, orderId);
    const t = this.totalsFor(order);
    const paid = order.payments.reduce((s, p) => s.plus(p.amount), ZERO);
    return {
      subtotal: t.subtotal.toFixed(2),
      discountAmount: t.discountAmount.toFixed(2),
      serviceCharge: t.serviceCharge.toFixed(2),
      vatAmount: t.vatAmount.toFixed(2),
      total: t.total.toFixed(2),
      paid: paid.toFixed(2),
      remaining: Prisma.Decimal.max(t.total.minus(paid), 0).toFixed(2),
    };
  }

  async applyDiscount(cafeId: number, orderId: number, dto: ApplyDiscountDto, actor: Actor) {
    const order = await this.loadForBilling(cafeId, orderId);
    if (order.status === 'paid' || order.status === 'cancelled') {
      throw new BadRequestException(`Cannot discount a ${order.status} order`);
    }
    if (order.payments.length > 0) {
      throw new BadRequestException('Payments are already recorded on this bill -- discount can no longer change');
    }
    if (dto.type === 'percent' && dto.value > 100) {
      throw new BadRequestException('A percentage discount cannot exceed 100%');
    }
    // Cashiers can give up to 20%; anything bigger is an admin decision.
    if (actor?.role !== 'admin' && dto.type === 'percent' && dto.value > 20) {
      throw new ForbiddenException('Discounts above 20% need an admin');
    }

    const removing = dto.value === 0;
    const updated = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.OrderUpdateInput = removing
        ? { discountType: null, discountValue: null, discountAmount: null, discountReason: null }
        : { discountType: dto.type, discountValue: dto.value, discountReason: dto.reason.trim() };
      let saved = await tx.order.update({ where: { id: orderId }, data });

      // If the bill was already generated, refresh its frozen totals too.
      if (order.status === 'billed') {
        const t = computeTotals(
          order.orderItems,
          { type: saved.discountType, value: saved.discountValue },
          order.cafe,
        );
        saved = await tx.order.update({
          where: { id: orderId },
          data: {
            subtotal: t.subtotal,
            discountAmount: t.discountAmount,
            serviceCharge: t.serviceCharge,
            vatAmount: order.cafe.vatEnabled ? t.vatAmount : null,
            total: t.total,
          },
        });
      }

      await this.audit.log(cafeId, actor, removing ? 'discount.remove' : 'discount.apply', 'order', orderId, {
        type: dto.type, value: dto.value, reason: dto.reason,
      }, tx);
      return saved;
    });
    this.ordersGateway.emitFloorChanged(cafeId);
    return updated;
  }

  async generateBill(cafeId: number, orderId: number) {
    const order = await this.loadForBilling(cafeId, orderId);

    if (order.status !== 'served') {
      throw new BadRequestException(`Order ${orderId} cannot be billed from status "${order.status}"`);
    }
    if (!order.orderItems.some((i) => !i.voidedAt)) {
      throw new BadRequestException('There is nothing to bill on this order');
    }

    const t = this.totalsFor(order);

    // Atomically take the next bill number for this cafe -- no two bills
    // ever share a number even under concurrent requests. A reopened bill
    // keeps its original number (it's the same bill, re-issued).
    const billed = await this.prisma.$transaction(async (tx) => {
      // Only one request can move served -> billed. Without this, three quick
      // taps each took a new bill number and left gaps in the sequence
      // (sequential bill numbers matter for tax records).
      const claimed = await tx.order.updateMany({ where: { id: orderId, cafeId, status: 'served' }, data: { status: 'billed' } });
      if (claimed.count === 0) {
        throw new BadRequestException('This bill was just generated -- refresh to see it');
      }
      let billNumber = order.billNumber;
      if (billNumber == null) {
        const updatedCafe = await tx.cafe.update({
          where: { id: cafeId },
          data: { lastBillNumber: { increment: 1 } },
          select: { lastBillNumber: true },
        });
        billNumber = updatedCafe.lastBillNumber;
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: 'billed',
          billNumber,
          subtotal: t.subtotal,
          discountAmount: t.discountAmount.gt(0) ? t.discountAmount : null,
          serviceCharge: t.serviceCharge.gt(0) ? t.serviceCharge : null,
          vatAmount: order.cafe.vatEnabled ? t.vatAmount : null,
          total: t.total,
        },
      });
    });
    this.ordersGateway.emitFloorChanged(cafeId);
    return billed;
  }

  // A customer can still add something after the bill is printed but
  // before paying. Allowed only while no money has been taken; logged.
  async reopenToServed(cafeId: number, orderId: number, actor: Actor) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: { payments: true },
    });

    if (!order) throw new NotFoundException(`Order ${orderId} does not exist`);
    if (order.status !== 'billed') {
      throw new BadRequestException(`Order ${orderId} cannot be reopened from status "${order.status}"`);
    }
    if (order.payments.length > 0) {
      throw new BadRequestException('Part of this bill is already paid -- it cannot be reopened');
    }

    const reopened = await this.prisma.$transaction(async (tx) => {
      await this.audit.log(cafeId, actor, 'bill.reopen', 'order', orderId, {
        billNumber: order.billNumber, total: order.total?.toFixed(2), printCount: order.printCount,
      }, tx);
      return tx.order.update({
        where: { id: orderId },
        data: { status: 'served', total: null, subtotal: null, vatAmount: null, serviceCharge: null, discountAmount: null },
      });
    });
    this.ordersGateway.emitFloorChanged(cafeId);
    return reopened;
  }

  async markPrinted(cafeId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, cafeId } });
    if (!order) throw new NotFoundException(`Order ${orderId} does not exist`);
    if (order.status !== 'billed' && order.status !== 'paid') {
      throw new BadRequestException('Only a generated bill can be printed');
    }
    return this.prisma.order.update({
      where: { id: orderId },
      data: { printCount: { increment: 1 } },
      select: { id: true, printCount: true },
    });
  }

  /** Legacy single-tap "paid in full by X" -- kept so older screens keep working. */
  async recordPayment(cafeId: number, orderId: number, dto: RecordPaymentDto, actor: Actor) {
    const order = await this.loadForBilling(cafeId, orderId);
    if (order.status !== 'billed' || !order.total) {
      throw new BadRequestException(`Order ${orderId} cannot be paid from status "${order.status}"`);
    }
    const paid = order.payments.reduce((s, p) => s.plus(p.amount), ZERO);
    const remaining = order.total.minus(paid);
    return this.addPayment(cafeId, orderId, { method: dto.method, amount: remaining.toNumber() }, actor);
  }

  // One payment towards a bill. When payments cover the total the order
  // closes: table freed, merged tables released, recipe ingredients deducted.
  async addPayment(cafeId: number, orderId: number, dto: AddPaymentDto, actor: Actor) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: {
        payments: true,
        orderItems: { select: { menuItemId: true, quantity: true, voidedAt: true } },
        cafe: { select: { inventoryEnabled: true, plan: true, subscriptionStatus: true } },
      },
    });

    if (!order) throw new NotFoundException(`Order ${orderId} does not exist`);
    if (order.status !== 'billed' || !order.total) {
      throw new BadRequestException('Generate the bill before taking payment');
    }

    const amount = D(dto.amount);
    const openShift = await this.prisma.shift.findFirst({
      where: { cafeId, closedAt: null },
      select: { id: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock this order's row, then re-read status and payments. Two cashiers
      // (or one double-tap) paying at the same moment now queue up here, and
      // the second one sees the first payment -- before this, both passed the
      // "how much is left" check and the bill got paid twice.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, total: true, payments: { select: { amount: true } } } });
      if (fresh.status !== 'billed' || !fresh.total) {
        throw new BadRequestException(fresh.status === 'paid' ? 'This bill is already paid' : 'Generate the bill before taking payment');
      }
      const paidSoFar = fresh.payments.reduce((s, p) => s.plus(p.amount), ZERO);
      const remaining = fresh.total.minus(paidSoFar);
      if (amount.gt(remaining.plus(0.001))) {
        throw new BadRequestException(`Only Rs ${remaining.toFixed(2)} is left to pay on this bill`);
      }

      const payment = await tx.payment.create({
        data: {
          orderId,
          amount,
          method: dto.method,
          reference: dto.reference?.trim() || null,
          receivedById: actor?.userId ?? null,
          shiftId: openShift?.id ?? null,
        },
      });

      const fullyPaid = paidSoFar.plus(amount).gte(fresh.total.minus(0.001));
      if (fullyPaid) {
        await tx.order.update({ where: { id: orderId }, data: { status: 'paid' } });
        await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'free' } });
        await tx.restaurantTable.updateMany({
          where: { mergedIntoId: order.tableId },
          data: { mergedIntoId: null, status: 'free' },
        });
        // NOTE: finished-goods stock (MenuItem.trackStock) was already taken
        // when the item was added -- the old code decremented it a second
        // time here, which double-counted every sale. Only recipe
        // ingredients are deducted at payment time.
        if (order.cafe.inventoryEnabled && hasFeature(order.cafe, 'inventory')) {
          await this.deductRecipes(tx, cafeId, orderId, order.orderItems, actor);
        }
      }
      return { payment, fullyPaid, remaining: Prisma.Decimal.max(remaining.minus(amount), 0).toFixed(2) };
    });

    this.ordersGateway.emitFloorChanged(cafeId);
    return result;
  }

  private async deductRecipes(
    tx: Prisma.TransactionClient,
    cafeId: number,
    orderId: number,
    items: { menuItemId: number; quantity: number; voidedAt: Date | null }[],
    actor: Actor,
  ) {
    const live = items.filter((i) => !i.voidedAt);
    if (live.length === 0) return;
    const recipes = await tx.recipeLine.findMany({
      where: { menuItemId: { in: [...new Set(live.map((i) => i.menuItemId))] }, stockItem: { cafeId } },
      include: { stockItem: { select: { avgCost: true } } },
    });
    if (recipes.length === 0) return;

    // Sum per stock item so one bill = one movement per ingredient.
    const usage = new Map<number, { qty: Prisma.Decimal; cost: Prisma.Decimal }>();
    for (const item of live) {
      for (const line of recipes.filter((r) => r.menuItemId === item.menuItemId)) {
        const prev = usage.get(line.stockItemId) ?? { qty: ZERO, cost: line.stockItem.avgCost };
        usage.set(line.stockItemId, { qty: prev.qty.plus(line.quantity.times(item.quantity)), cost: prev.cost });
      }
    }
    for (const [stockItemId, u] of usage) {
      await tx.stockMovement.create({
        data: {
          cafeId, stockItemId, type: 'sale', quantity: u.qty.negated(), unitCost: u.cost,
          refType: 'order', refId: orderId, createdById: actor?.userId ?? null,
        },
      });
      await tx.stockItem.update({ where: { id: stockItemId }, data: { currentQty: { decrement: u.qty } } });
    }
  }

  // ── Items ───────────────────────────────────────────────────────────

  // Removing an item the kitchen hasn't seen yet is just a correction --
  // the row is deleted. Once it reached the kitchen, use voidItem instead.
  /**
   * +/- on a line that hasn't gone to the kitchen yet (cart stepper, and
   * "Undo" after adding). Reaching 0 removes the line. Tracked stock moves
   * with it. Sent lines can't change -- those need a void with a reason.
   */
  async changeQuantity(cafeId: number, orderItemId: number, delta: number) {
    const line = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { cafeId } },
      include: { order: { select: { id: true, status: true } }, menuItem: true },
    });
    if (!line) throw new NotFoundException(`Order item ${orderItemId} does not exist`);
    if (line.sentToKitchen || line.voidedAt || !['pending', 'preparing', 'served'].includes(line.order.status)) {
      throw new BadRequestException('This item already reached the kitchen -- void it with a reason instead');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${line.orderId} FOR UPDATE`;
      const fresh = await tx.orderItem.findUnique({ where: { id: orderItemId } });
      if (!fresh || fresh.sentToKitchen) {
        throw new BadRequestException('This item already reached the kitchen -- void it with a reason instead');
      }
      const next = fresh.quantity + delta;
      if (next < 0) throw new BadRequestException('Quantity cannot go below zero');
      if (next > 99) throw new BadRequestException('That is a lot -- maximum 99 per line');

      if (line.menuItem.trackStock) {
        if (delta > 0) {
          const mi = await tx.menuItem.findUniqueOrThrow({ where: { id: line.menuItemId } });
          if (mi.stockQuantity < delta) throw new BadRequestException(`Only ${mi.stockQuantity} of "${mi.name}" left in stock`);
          await tx.menuItem.update({ where: { id: line.menuItemId }, data: { stockQuantity: { decrement: delta } } });
        } else {
          await tx.menuItem.update({ where: { id: line.menuItemId }, data: { stockQuantity: { increment: -delta } } });
        }
      }

      if (next === 0) {
        await tx.orderItemModifier.deleteMany({ where: { orderItemId } });
        await tx.orderItem.delete({ where: { id: orderItemId } });
        return null;
      }
      return tx.orderItem.update({ where: { id: orderItemId }, data: { quantity: next } });
    });
    this.ordersGateway.emitFloorChanged(cafeId);
    return { removed: updated === null, quantity: updated?.quantity ?? 0 };
  }

  async removeItem(cafeId: number, orderItemId: number) {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { cafeId } },
      include: { order: { select: { id: true, status: true } }, menuItem: true },
    });

    if (!orderItem) {
      throw new NotFoundException(`Order item ${orderItemId} does not exist`);
    }

    if (orderItem.sentToKitchen || !['pending', 'preparing', 'served'].includes(orderItem.order.status)) {
      throw new BadRequestException('This item already reached the kitchen -- void it with a reason instead');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItemModifier.deleteMany({ where: { orderItemId } });
      await tx.orderItem.delete({ where: { id: orderItemId } });
      if (orderItem.menuItem.trackStock) {
        await tx.menuItem.update({
          where: { id: orderItem.menuItemId },
          data: { stockQuantity: { increment: orderItem.quantity } },
        });
      }
    });
    this.ordersGateway.emitFloorChanged(cafeId);
  }

  // Void = the item was sent to the kitchen but won't be charged (customer
  // changed their mind, wrong item, spilled). The row is KEPT with who/why so
  // it shows struck-through on the KDS and in the discounts & voids report.
  async voidItem(cafeId: number, orderItemId: number, reason: string, actor: Actor) {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { cafeId } },
      include: { order: { select: { id: true, status: true, table: { select: { tableNumber: true } } } }, menuItem: true },
    });
    if (!orderItem) throw new NotFoundException(`Order item ${orderItemId} does not exist`);
    if (orderItem.voidedAt) throw new BadRequestException('Already voided');
    if (orderItem.order.status === 'billed') {
      throw new BadRequestException('Reopen the bill before voiding an item');
    }
    if (orderItem.order.status === 'paid' || orderItem.order.status === 'cancelled') {
      throw new BadRequestException(`Cannot void an item on a ${orderItem.order.status} order`);
    }

    const voided = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.orderItem.update({
        where: { id: orderItemId },
        data: { voidedAt: new Date(), voidReason: reason.trim(), voidedById: actor?.userId ?? null },
      });
      if (orderItem.menuItem.trackStock) {
        await tx.menuItem.update({
          where: { id: orderItem.menuItemId },
          data: { stockQuantity: { increment: orderItem.quantity } },
        });
      }
      await this.audit.log(cafeId, actor, 'item.void', 'order', orderItem.orderId, {
        orderItemId, item: orderItem.menuItem.name, quantity: orderItem.quantity,
        amount: orderItem.price.times(orderItem.quantity).toFixed(2), reason,
      }, tx);

      // If voiding leaves nothing pending in the kitchen, the order is ready to serve.
      const stillCooking = await tx.orderItem.count({
        where: { orderId: orderItem.orderId, status: 'pending', sentToKitchen: true, voidedAt: null },
      });
      if (stillCooking === 0 && orderItem.order.status === 'preparing') {
        const anyLive = await tx.orderItem.count({ where: { orderId: orderItem.orderId, voidedAt: null } });
        if (anyLive > 0) {
          await tx.orderItem.updateMany({ where: { orderId: orderItem.orderId, status: 'ready' }, data: { status: 'served' } });
          await tx.order.update({ where: { id: orderItem.orderId }, data: { status: 'served' } });
        }
      }
      return updated;
    });

    this.ordersGateway.emitCafe(cafeId, 'order.itemVoided', { orderId: orderItem.orderId, orderItemId });
    this.ordersGateway.emitFloorChanged(cafeId);
    await this.notifications?.notify(cafeId, 'voided', {
      orderId: orderItem.orderId,
      tableNumber: orderItem.order?.table?.tableNumber,
      data: { items: [`${orderItem.quantity}x ${orderItem.menuItem.name}`], reason: reason.trim() },
    });
    return voided;
  }

  /**
   * Bills = orders that have had a bill generated (billNumber set). Newest
   * first, keyset-paginated by id so "Load more" stays fast on a busy cafe.
   */
  async listBills(cafeId: number, f: ListBillsDto) {
    const take = f.take ?? 30;
    const tz = f.tz ?? 345;
    const where: Prisma.OrderWhereInput = { cafeId, billNumber: { not: null } };

    if (f.status === 'paid') where.status = 'paid';
    else if (f.status === 'cancelled') where.status = 'cancelled';
    else if (f.status === 'unpaid') where.status = { notIn: ['paid', 'cancelled'] };

    // Local calendar day -> UTC instant: midnight local is (midnight UTC - tz).
    const dayStart = (d: string) => new Date(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) - tz * 60000);
    if (f.from || f.to) {
      where.createdAt = {
        ...(f.from ? { gte: dayStart(f.from) } : {}),
        ...(f.to ? { lt: new Date(dayStart(f.to).getTime() + 86400000) } : {}),
      };
    }

    const q = f.q?.trim().replace(/^#/, '');
    if (q) {
      const n = /^\d+$/.test(q) ? Number(q) : null;
      where.OR = [
        ...(n !== null ? [{ billNumber: n }, { id: n }] : []),
        { table: { tableNumber: { equals: q, mode: 'insensitive' as const } } },
      ];
    }

    const rows = await this.prisma.order.findMany({
      where: { ...where, ...(f.before ? { id: { lt: f.before } } : {}) },
      orderBy: { id: 'desc' },
      take: take + 1,
      select: {
        id: true, billNumber: true, status: true, source: true, orderType: true,
        total: true, discountAmount: true, printCount: true, createdAt: true,
        table: { select: { tableNumber: true } },
        waiter: { select: { name: true } },
        payments: { select: { method: true, amount: true, paidAt: true }, orderBy: { paidAt: 'asc' } },
      },
    });

    const hasMore = rows.length > take;
    const page = rows.slice(0, take).map((o) => {
      const paid = o.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
      return {
        id: o.id,
        billNumber: o.billNumber,
        status: o.status,
        source: o.source,
        orderType: o.orderType,
        table: o.table.tableNumber,
        waiter: o.waiter?.name ?? (o.source === 'qr' ? 'QR order' : null),
        total: o.total?.toFixed(2) ?? null,
        paid: paid.toFixed(2),
        discount: o.discountAmount?.toFixed(2) ?? null,
        methods: [...new Set(o.payments.map((p) => p.method))],
        printCount: o.printCount,
        createdAt: o.createdAt,
        paidAt: o.payments.at(-1)?.paidAt ?? null,
      };
    });
    return { bills: page, nextBefore: hasMore ? page.at(-1)!.id : null };
  }

  async findOne(cafeId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: {
        orderItems: { include: ITEM_INCLUDE, orderBy: { id: 'asc' } },
        table: true,
        waiter: { select: { id: true, name: true } },
        payments: { orderBy: { paidAt: 'asc' } },
        cafe: {
          select: {
            name: true, vatEnabled: true, vatRate: true, panNumber: true, logoUrl: true,
            address: true, phone: true, wifiName: true, wifiPassword: true, instagram: true,
            receiptFooter: true, serviceChargeRate: true, pricesIncludeVat: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    return order;
  }

  async updateNotes(cafeId: number, orderId: number, dto: UpdateOrderNotesDto) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, cafeId } });
    if (!order) throw new NotFoundException(`Order ${orderId} does not exist`);
    return this.prisma.order.update({
      where: { id: orderId },
      data: { notes: dto.notes?.trim() || null },
    });
  }

  /**
   * Merge all items from `sourceOrderId` into `targetOrderId`, then cancel
   * the source order so its table is freed.
   */
  async mergeInto(cafeId: number, sourceOrderId: number, targetOrderId: number) {
    if (sourceOrderId === targetOrderId) {
      throw new BadRequestException('Cannot merge an order into itself');
    }

    await this.prisma.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.order.findFirst({
          where: { id: sourceOrderId, cafeId },
          include: { orderItems: { include: { orderItemModifiers: true } } },
        }),
        tx.order.findFirst({ where: { id: targetOrderId, cafeId } }),
      ]);

      if (!source) throw new NotFoundException(`Order ${sourceOrderId} does not exist`);
      if (!target) throw new NotFoundException(`Order ${targetOrderId} does not exist`);

      const closed: OrderStatus[] = ['paid', 'cancelled', 'billed'];
      if (closed.includes(source.status)) throw new BadRequestException(`Source order is ${source.status}`);
      if (closed.includes(target.status)) throw new BadRequestException(`Target order is ${target.status}`);

      for (const item of source.orderItems) {
        await tx.orderItem.create({
          data: {
            orderId: targetOrderId,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            price: item.price,
            status: item.status,
            sentToKitchen: item.sentToKitchen,
            note: item.note,
            station: item.station,
            voidedAt: item.voidedAt,
            voidReason: item.voidReason,
            voidedById: item.voidedById,
            orderItemModifiers: {
              create: item.orderItemModifiers.map((oim) => ({ modifierId: oim.modifierId })),
            },
          },
        });
      }

      await tx.order.update({
        where: { id: sourceOrderId },
        data: { status: 'cancelled', cancelReason: `Merged into order #${targetOrderId}` },
      });
      await tx.restaurantTable.update({ where: { id: source.tableId }, data: { status: 'free' } });

      const sourceWasActive =
        source.status === 'preparing' ||
        source.orderItems.some((i) => i.status === 'ready' || i.status === 'served' || (i.sentToKitchen && i.status === 'pending'));
      if (sourceWasActive && (target.status === 'pending' || target.status === 'served')) {
        const cooking = source.orderItems.some((i) => i.status === 'pending' && i.sentToKitchen && !i.voidedAt);
        await tx.order.update({
          where: { id: targetOrderId },
          data: { status: cooking ? 'preparing' : target.status === 'pending' ? 'preparing' : target.status },
        });
      }
    });

    this.ordersGateway.emitFloorChanged(cafeId);
    return this.findOne(cafeId, targetOrderId);
  }

  /** Move an entire order to a different (free) table. */
  async moveToTable(cafeId: number, orderId: number, targetTableId: number) {
    const moved = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, cafeId } });
      if (!order) throw new NotFoundException(`Order ${orderId} not found`);

      if (order.status === 'paid' || order.status === 'cancelled') {
        throw new BadRequestException('Cannot move a closed order');
      }

      const targetTable = await tx.restaurantTable.findFirst({ where: { id: targetTableId, cafeId } });
      if (!targetTable) throw new NotFoundException(`Table ${targetTableId} not found`);
      if (targetTable.status !== 'free') {
        throw new BadRequestException(`Table ${targetTable.tableNumber} is not free`);
      }

      await tx.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'free' } });
      await tx.restaurantTable.update({ where: { id: targetTableId }, data: { status: 'occupied' } });
      await tx.order.update({ where: { id: orderId }, data: { tableId: targetTableId } });
      return orderId;
    });

    this.ordersGateway.emitFloorChanged(cafeId);
    return this.findOne(cafeId, moved);
  }
}
