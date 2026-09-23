import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AddOrderDto } from './dto/add-item.dto.js';
import { RecordPaymentDto } from './dto/record-payment.dto.js';
import { UpdateOrderNotesDto } from './dto/update-order-notes.dto.js';
import { Prisma, OrderStatus } from '../generated/prisma/client.js';
import { OrdersGateway } from './orders.gateway.js';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private ordersGateway: OrdersGateway,
  ) {}

  async findAll(cafeId: number, status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: { cafeId, ...(status ? { status } : {}) },
      include: {
        orderItems: {
          include: {
            menuItem: true,
            orderItemModifiers: { include: { modifier: true } },
          },
        },
        table: true,
        waiter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(cafeId: number, dto: CreateOrderDto) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { id: dto.tableId, cafeId },
    });

    if (!table) {
      throw new NotFoundException(`Table ${dto.tableId} does not exist`);
    }

    if (table.status !== 'free') {
      throw new BadRequestException(`Table ${dto.tableId} is not free`);
    }

    // A waiter id from another cafe should never be assignable here --
    // without this check a valid-looking id from a different tenant would
    // otherwise pass Prisma's FK check (the users table has no cafe
    // concept baked into the FK itself) and silently attach cross-tenant.
    const waiter = await this.prisma.user.findFirst({
      where: { id: dto.waiterId, cafeId },
    });

    if (!waiter) {
      throw new NotFoundException(`Waiter ${dto.waiterId} does not exist`);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          cafeId,
          tableId: dto.tableId,
          waiterId: dto.waiterId,
          orderType: dto.orderType,
        },
      });

      await tx.restaurantTable.update({
        where: { id: dto.tableId },
        data: { status: 'occupied' },
      });

      return order;
    });
  }

  // A customer ordering in rounds (food first, a drink later) is the normal
  // case, not an edge case -- so items can join an order any time before the
  // bill is generated. Once it's billed the total is locked in, so that (and
  // paid/cancelled) are the only statuses this refuses.
  private static readonly ADDABLE_STATUSES: OrderStatus[] = [
    'pending',
    'preparing',
    'served',
  ];

  async addItem(cafeId: number, orderId: number, dto: AddOrderDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    if (!OrdersService.ADDABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Cannot add items to an order with status "${order.status}"`,
      );
    }

    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: dto.menuItemId, cafeId },
    });

    if (!menuItem) {
      throw new NotFoundException(`Menu item ${dto.menuItemId} does not exist`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Re-check stock inside the transaction rather than trusting the
      // `menuItem` fetched above -- that read happened before the
      // transaction opened, so it can't be relied on to still be current
      // if two waiters add the last few of the same item at once.
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

      const orderItem = await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: dto.menuItemId,
          quantity: dto.quantity,
          price: menuItem.price, // snapshotting the CURRENT price at order time
        },
      });

      if (dto.modifierIds && dto.modifierIds.length > 0) {
        await tx.orderItemModifier.createMany({
          data: dto.modifierIds.map((modifierId) => ({
            orderItemId: orderItem.id,
            modifierId,
          })),
        });
      }

      // A new round on an order the kitchen already finished ("served")
      // goes back to "pending" so the waiter can review, remove items if
      // the customer changes their mind, and then explicitly send to kitchen.
      // Previously this went straight to "preparing" which bypassed the
      // waiter's chance to cancel before the kitchen sees the new items.
      if (order.status === 'served') {
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'pending' },
        });
      }

      return tx.orderItem.findUnique({
        where: { id: orderItem.id },
        include: { orderItemModifiers: { include: { modifier: true } } },
      });
    });

    // Don't auto-notify the kitchen — waiter will press "Send to kitchen"
    // themselves once they're happy with the new round.

    return result;
  }

  async sendToKitchen(cafeId: number, orderId: number) {
  const order = await this.prisma.order.findFirst({
    where: { id: orderId, cafeId },
    include: { orderItems: true },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  if (order.status !== 'pending') {
    throw new BadRequestException(
      `Order ${orderId} cannot be sent to kitchen from status "${order.status}"`,
    );
  }

  if (order.orderItems.length === 0) {
    throw new BadRequestException(
      `Order ${orderId} has no items — add at least one item before sending to kitchen`,
    );
  }

  const updated = await this.prisma.order.update({
    where: { id: orderId },
    data: { status: 'preparing' },
  });

  this.ordersGateway.emitOrderSentToKitchen(cafeId, { orderId: updated.id });

  return updated;
}

    async markItemReady(cafeId: number, orderItemId: number) {
    // OrderItem has no cafeId of its own (scoped transitively through its
    // order), so the lookup joins up to order to enforce the tenant
    // boundary -- see the schema comments on OrderItem/Payment/Modifier.
    const orderItem = await this.prisma.orderItem.findFirst({
    where: { id: orderItemId, order: { cafeId } },
  });

  if (!orderItem) {
    throw new NotFoundException(`Order item ${orderItemId} does not exist`);
  }

  if (orderItem.status !== 'pending') {
    throw new BadRequestException(
      `Order item ${orderItemId} cannot be marked ready from status "${orderItem.status}"`,
    );
  }

  const updated = await this.prisma.orderItem.update({
    where: { id: orderItemId },
    data: { status: 'ready' },
  });

  this.ordersGateway.emitOrderItemReady(cafeId, {
    orderId: updated.orderId,
    orderItemId: updated.id,
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
    throw new BadRequestException(
      `Order ${orderId} cannot be served from status "${order.status}"`,
    );
  }

  const notReady = order.orderItems.filter((item) => item.status === 'pending');

  if (notReady.length > 0) {
    throw new BadRequestException(
      `Order ${orderId} cannot be served -- ${notReady.length} item(s) are still pending in the kitchen`,
    );
  }

  return this.prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({
      where: { orderId, status: 'ready' },
      data: { status: 'served' },
    });

    return tx.order.update({
      where: { id: orderId },
      data: { status: 'served' },
    });
  });
}

    async cancel(cafeId: number, orderId: number) {
  const order = await this.prisma.order.findFirst({
    where: { id: orderId, cafeId },
    include: { orderItems: { include: { menuItem: true } } },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  if (order.status !== 'pending') {
    throw new BadRequestException(
      `Order ${orderId} cannot be cancelled from status "${order.status}" — cancellation is only allowed before the order is sent to kitchen`,
    );
  }

  return this.prisma.$transaction(async (tx) => {
    // The stock for any tracked item was already decremented when it was
    // added (see addItem) -- a cancelled order never got made, so that
    // stock needs to go back rather than staying lost.
    for (const item of order.orderItems) {
      if (item.menuItem.trackStock) {
        await tx.menuItem.update({
          where: { id: item.menuItemId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      }
    }

    const cancelledOrder = await tx.order.update({
      where: { id: orderId },
      data: { status: 'cancelled' },
    });

    await tx.restaurantTable.update({
      where: { id: order.tableId },
      data: { status: 'free' },
    });

    return cancelledOrder;
  });
}

  async generateBill(cafeId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: {
        orderItems: {
          include: {
            orderItemModifiers: {
              include: { modifier: true },
            },
          },
        },
        cafe: {
          select: { vatEnabled: true, vatRate: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    if (order.status !== 'served') {
      throw new BadRequestException(
        `Order ${orderId} cannot be billed from status "${order.status}"`,
      );
    }

    let subtotal = new Prisma.Decimal(0);

    for (const item of order.orderItems) {
      const modifierTotal = item.orderItemModifiers.reduce(
        (sum, oim) => sum.plus(oim.modifier.priceDelta),
        new Prisma.Decimal(0),
      );
      const lineTotal = item.price.plus(modifierTotal).times(item.quantity);
      subtotal = subtotal.plus(lineTotal);
    }

    let total: Prisma.Decimal;
    let vatAmount: Prisma.Decimal | null = null;

    if (order.cafe.vatEnabled) {
      // vatRate is stored as a percentage (e.g. 13 means 13%)
      vatAmount = subtotal.times(order.cafe.vatRate).dividedBy(100).toDecimalPlaces(2);
      total = subtotal.plus(vatAmount);
    } else {
      total = subtotal;
    }

    // Atomically increment the cafe's bill counter and assign the next
    // sequential bill number to this order. Using $transaction ensures
    // no two bills for the same cafe can get the same number even under
    // concurrent requests.
    return this.prisma.$transaction(async (tx) => {
      const updatedCafe = await tx.cafe.update({
        where: { id: cafeId },
        data: { lastBillNumber: { increment: 1 } },
        select: { lastBillNumber: true },
      });

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: 'billed',
          billNumber: updatedCafe.lastBillNumber,
          subtotal: order.cafe.vatEnabled ? subtotal : null,
          vatAmount,
          total,
        },
      });
    });
  }

  // A customer can still say "add one more thing" after being billed but
  // before actually paying -- this undoes generateBill so the order goes
  // back through addItem()'s normal 'served' -> 'preparing' reopening if
  // something new is added, or straight back to Serve if the waiter just
  // mis-clicked. The total is cleared rather than left stale, since it was
  // only ever correct for the item set at the moment it was billed.
  async reopenToServed(cafeId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    if (order.status !== 'billed') {
      throw new BadRequestException(
        `Order ${orderId} cannot be reopened from status "${order.status}"`,
      );
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'served', total: null, subtotal: null, vatAmount: null },
    });
  }

  async recordPayment(cafeId: number, orderId: number, dto: RecordPaymentDto) {
  const order = await this.prisma.order.findFirst({
    where: { id: orderId, cafeId },
    include: {
      orderItems: {
        include: {
          menuItem: { select: { id: true, trackStock: true } },
        },
      },
    },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  if (order.status !== 'billed') {
    throw new BadRequestException(
      `Order ${orderId} cannot be paid from status "${order.status}"`,
    );
  }

  return this.prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        orderId,
        amount: order.total!,
        method: dto.method,
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'paid' },
    });

    await tx.restaurantTable.update({
      where: { id: order.tableId },
      data: { status: 'free' },
    });

    // Deduct stock for tracked menu items
    for (const item of order.orderItems) {
      if (!item.menuItem.trackStock) continue;
      await tx.menuItem.update({
        where: { id: item.menuItem.id },
        data: {
          stockQuantity: {
            decrement: item.quantity,
          },
        },
      });
      // Clamp to 0 — never go negative
      await tx.$executeRaw`
        UPDATE "menu_items"
        SET "stock_quantity" = GREATEST("stock_quantity", 0)
        WHERE id = ${item.menuItem.id}
      `;
    }

    return payment;
  });
}

  async removeItem(cafeId: number, orderItemId: number) {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { cafeId } },
      include: { order: { select: { id: true, status: true } } },
    });

    if (!orderItem) {
      throw new NotFoundException(`Order item ${orderItemId} does not exist`);
    }

    const orderStatus = orderItem.order.status;

    // Allow removal when order is still pending (not sent to kitchen yet)
    // OR when order is preparing but this specific item is still pending in the
    // kitchen (waiter added a new round and wants to remove before kitchen sees it).
    // Items already marked ready or served cannot be removed.
    if (orderStatus === 'pending') {
      // Fine — order hasn't gone to kitchen yet
    } else if (orderStatus === 'preparing' && orderItem.status === 'pending') {
      // Fine — item not yet picked up by kitchen
    } else {
      throw new BadRequestException(
        orderStatus === 'preparing'
          ? 'This item is already being prepared by the kitchen and cannot be removed'
          : 'Items can only be removed before they reach the kitchen',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: orderItemId } });

      // If this was the last pending item on a preparing order and removing it
      // leaves no items at all, or all remaining items are ready/served,
      // we don't need to do anything — the order status stays as-is.
      // (The kitchen will notice nothing is left to prepare.)
    });
  }

  async findOne(cafeId: number, orderId: number) {
  const order = await this.prisma.order.findFirst({
    where: { id: orderId, cafeId },
    include: {
      orderItems: {
        include: {
          menuItem: true,
          orderItemModifiers: {
            include: { modifier: true },
          },
        },
      },
      table: true,
      waiter: { select: { id: true, name: true } },
      payments: true,
      cafe: { select: { name: true, vatEnabled: true, vatRate: true, panNumber: true } },
    },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  return order;
}


  async updateNotes(cafeId: number, orderId: number, dto: UpdateOrderNotesDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { notes: dto.notes?.trim() || null } as any,
    });
  }

}