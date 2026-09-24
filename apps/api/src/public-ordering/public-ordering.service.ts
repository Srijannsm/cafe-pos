import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PlaceOrderDto } from './dto/place-order.dto.js';
import { assertQrOrderingAllowed } from '../subscription/plan-limits.js';

@Injectable()
export class PublicOrderingService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
  ) {}

  private async findTableOrThrow(qrToken: string) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { qrToken },
      include: { cafe: true },
    });

    if (!table || !table.cafe.isActive) {
      throw new NotFoundException('This ordering link is no longer valid');
    }

    return table;
  }

  private findActiveOrder(cafeId: number, tableId: number) {
    // Same "active" definition tables.service.ts uses for the floor view:
    // anything that isn't paid or cancelled is still in progress, and a
    // second scan (or a later round) should join that order rather than
    // start a competing one.
    return this.prisma.order.findFirst({
      where: { cafeId, tableId, status: { notIn: ['paid', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTableForOrdering(qrToken: string) {
    const table = await this.findTableOrThrow(qrToken);

    // Gate QR ordering by plan -- Starter cafes don't get self-ordering.
    assertQrOrderingAllowed(table.cafe);

    const [menu, activeOrder] = await Promise.all([
      this.prisma.menuItem.findMany({
        where: { cafeId: table.cafeId, isAvailable: true },
        include: { category: true, modifiers: true },
        orderBy: { category: { sortOrder: 'asc' } },
      }),
      this.findActiveOrder(table.cafeId, table.id).then((order) =>
        order
          ? this.prisma.order.findUnique({
              where: { id: order.id },
              include: {
                orderItems: {
                  include: { menuItem: true, orderItemModifiers: { include: { modifier: true } } },
                },
              },
            })
          : null,
      ),
    ]);

    return {
      cafe: { name: table.cafe.name, slug: table.cafe.slug },
      table: { id: table.id, tableNumber: table.tableNumber },
      menu,
      activeOrder,
    };
  }

  async placeOrder(qrToken: string, dto: PlaceOrderDto) {
    const table = await this.findTableOrThrow(qrToken);

    // Gate QR ordering by plan -- checked on both read AND write so that
    // a plan downgrade mid-session takes effect on the next request.
    assertQrOrderingAllowed(table.cafe);

    let order = await this.findActiveOrder(table.cafeId, table.id);

    if (!order) {
      // Mirrors OrdersService.create()'s own rule for waiter-started
      // orders: a fresh order only ever starts on a free table. If the
      // table isn't free and there's no active order to join, something's
      // off (a stale status, a table mid-cleanup) that a customer can't
      // resolve themselves.
      if (table.status !== 'free') {
        throw new BadRequestException(
          "This table already has something going on -- please ask a staff member.",
        );
      }

      order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            cafeId: table.cafeId,
            tableId: table.id,
            waiterId: null,
            orderType: 'dine_in',
          },
        });
        await tx.restaurantTable.update({ where: { id: table.id }, data: { status: 'occupied' } });
        return created;
      });
    }

    // Reuses OrdersService.addItem for every line -- same stock checks,
    // price snapshotting, modifier handling, and kitchen-board reopening
    // logic a waiter's own "add item" goes through. The very first round
    // still lands as a 'pending' order that a staff member has to send to
    // kitchen themselves (addItem doesn't do that), so nothing a customer
    // submits reaches the kitchen without a staff member confirming it.
    for (const item of dto.items) {
      await this.ordersService.addItem(table.cafeId, order.id, {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        modifierIds: item.modifierIds ?? [],
      });
    }

    return this.ordersService.findOne(table.cafeId, order.id);
  }
}
