import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { OrdersGateway } from '../orders/orders.gateway.js';
import { PlaceOrderDto, TableRequestDto } from './dto/place-order.dto.js';
import { assertQrOrderingAllowed, hasFeature } from '../subscription/plan-limits.js';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class PublicOrderingService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private gateway: OrdersGateway,
  ) {}

  async findTableOrThrow(qrToken: string) {
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
    // Same "active" definition the floor view uses.
    return this.prisma.order.findFirst({
      where: { cafeId, tableId, status: { notIn: ['paid', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // What the customer sees about their order. Deliberately trimmed: no
  // waiter ids, no internal notes -- just what's on the table and its state.
  private async customerOrder(cafeId: number, tableId: number) {
    const active = await this.findActiveOrder(cafeId, tableId);
    if (!active) return null;
    const order = await this.prisma.order.findUnique({
      where: { id: active.id },
      include: {
        orderItems: {
          where: { voidedAt: null },
          orderBy: { id: 'asc' },
          include: { menuItem: { select: { name: true } }, orderItemModifiers: { include: { modifier: { select: { name: true, priceDelta: true } } } } },
        },
      },
    });
    if (!order) return null;
    return {
      id: order.id,
      status: order.status,
      total: order.total?.toFixed(2) ?? null,
      items: order.orderItems.map((i) => ({
        id: i.id,
        name: i.menuItem.name,
        quantity: i.quantity,
        price: i.orderItemModifiers.reduce((s, m) => s.plus(m.modifier.priceDelta), new Prisma.Decimal(i.price)).toFixed(2),
        modifiers: i.orderItemModifiers.map((m) => m.modifier.name),
        note: i.note,
        // waiting = staff hasn't confirmed yet; cooking; ready; served
        stage: !i.sentToKitchen ? 'waiting' : i.status === 'pending' ? 'cooking' : i.status,
      })),
    };
  }

  async getTableForOrdering(qrToken: string) {
    const table = await this.findTableOrThrow(qrToken);
    assertQrOrderingAllowed(table.cafe);
    const c = table.cafe;

    const [categories, menu, activeOrder, popular] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { cafeId: c.id, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, parentId: true },
      }),
      this.prisma.menuItem.findMany({
        where: { cafeId: c.id, category: { isActive: true } },
        include: { modifiers: { select: { id: true, name: true, priceDelta: true } } },
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.customerOrder(c.id, table.id),
      this.prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: { voidedAt: null, order: { cafeId: c.id, status: 'paid', createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 6,
      }),
    ]);

    return {
      cafe: {
        name: c.name, slug: c.slug, logoUrl: c.logoUrl, coverImageUrl: c.coverImageUrl, themeColor: c.themeColor,
        tagline: c.tagline, fontStyle: c.fontStyle, menuLayout: c.menuLayout,
        phone: c.phone, address: c.address, wifiName: c.wifiName, wifiPassword: c.wifiPassword,
        instagram: c.instagram, facebook: c.facebook, tiktok: c.tiktok,
        vatEnabled: c.vatEnabled, pricesIncludeVat: c.pricesIncludeVat, vatRate: c.vatRate.toFixed(2),
        serviceChargeRate: c.serviceChargeRate.toFixed(2), panNumber: c.panNumber,
        gamesEnabled: c.gamesEnabled && hasFeature(c, 'tableGame'),
      },
      table: { id: table.id, tableNumber: table.tableNumber },
      categories,
      menu: menu.map((m) => ({
        id: m.id, name: m.name, price: m.price.toFixed(2), description: m.description, imageUrl: m.imageUrl,
        tags: m.tags, categoryId: m.categoryId, isAvailable: m.isAvailable && (!m.trackStock || m.stockQuantity > 0),
        modifiers: m.modifiers.map((x) => ({ id: x.id, name: x.name, priceDelta: x.priceDelta.toFixed(2) })),
      })),
      popularIds: popular.map((p) => p.menuItemId),
      activeOrder,
    };
  }

  async getStatus(qrToken: string) {
    const table = await this.findTableOrThrow(qrToken);
    const pending = await this.prisma.tableRequest.findMany({
      where: { tableId: table.id, resolvedAt: null },
      select: { type: true, createdAt: true },
    });
    return { activeOrder: await this.customerOrder(table.cafeId, table.id), openRequests: pending };
  }

  async placeOrder(qrToken: string, dto: PlaceOrderDto) {
    const table = await this.findTableOrThrow(qrToken);
    assertQrOrderingAllowed(table.cafe);

    let order = await this.findActiveOrder(table.cafeId, table.id);
    if (order?.status === 'billed') {
      throw new BadRequestException('Your bill is already printed -- please ask a staff member to add more.');
    }

    if (!order) {
      if (table.status !== 'free' && table.mergedIntoId == null) {
        // A stale status with no active order -- heal it like OrdersService.create does.
        await this.prisma.restaurantTable.update({ where: { id: table.id }, data: { status: 'free' } });
      }
      order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: { cafeId: table.cafeId, tableId: table.id, waiterId: null, orderType: 'dine_in', source: 'qr' },
        });
        await tx.restaurantTable.update({ where: { id: table.id }, data: { status: 'occupied' } });
        return created;
      });
    }

    // Same path as a waiter's "add item": stock checks, price snapshot,
    // modifier ownership check. Nothing reaches the kitchen until a staff
    // member confirms it with "Send to kitchen".
    for (const item of dto.items) {
      await this.ordersService.addItem(table.cafeId, order.id, {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        modifierIds: item.modifierIds ?? [],
        note: item.note,
      });
    }

    this.gateway.emitCafe(table.cafeId, 'qr.orderPlaced', {
      orderId: order.id, tableId: table.id, tableNumber: table.tableNumber, items: dto.items.length,
    });
    return this.customerOrder(table.cafeId, table.id);
  }

  async createRequest(qrToken: string, dto: TableRequestDto) {
    const table = await this.findTableOrThrow(qrToken);
    // One open request of each type per table, and at most one per minute,
    // so a bored kid can't make the floor screen beep all night.
    const recent = await this.prisma.tableRequest.findFirst({
      where: {
        tableId: table.id,
        type: dto.type,
        OR: [{ resolvedAt: null }, { createdAt: { gte: new Date(Date.now() - 60000) } }],
      },
    });
    if (recent) {
      throw new HttpException('Already on its way -- staff have been notified', HttpStatus.TOO_MANY_REQUESTS);
    }
    const req = await this.prisma.tableRequest.create({
      data: { cafeId: table.cafeId, tableId: table.id, type: dto.type },
    });
    this.gateway.emitCafe(table.cafeId, 'table.request', {
      id: req.id, type: req.type, tableId: table.id, tableNumber: table.tableNumber,
    });
    this.gateway.emitFloorChanged(table.cafeId);
    return { ok: true };
  }
}
