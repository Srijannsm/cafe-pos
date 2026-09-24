import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTableDto } from './dto/create-table.dto.js';
import { UpdateTableDto } from './dto/update-table.dto.js';
import { assertNotOverdue, assertTableLimit } from '../subscription/plan-limits.js';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async findAll(cafeId: number) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: { cafeId },
      orderBy: { tableNumber: 'asc' },
      include: {
        mergedFrom: { select: { id: true, tableNumber: true } },
      },
    });

    const activeOrders = await this.prisma.order.findMany({
      where: { cafeId, status: { notIn: ['paid', 'cancelled'] } },
      select: { id: true, tableId: true, status: true },
    });

    return tables.map((table) => {
      const activeOrder = activeOrders.find((order) => order.tableId === table.id);
      // A table absorbed into another (mergedIntoId set) is treated as reserved
      // so the floor view can hide it. The primary table shows mergedFrom info.
      const derivedStatus =
        table.mergedIntoId != null
          ? 'reserved'
          : table.status === 'reserved'
            ? 'reserved'
            : activeOrder
              ? 'occupied'
              : 'free';
      return {
        ...table,
        status: derivedStatus,
        activeOrderId: activeOrder?.id ?? null,
        activeOrderStatus: activeOrder?.status ?? null,
        // mergedFrom / mergedIntoId come through from the include above
      };
    });
  }

  /**
   * Physical table merge (pre-order): absorb secondaryId into primaryId.
   * Both tables must be free (no active orders) and belong to this cafe.
   * The secondary table's status becomes 'reserved' (hidden from floor);
   * the primary keeps its 'free' status so a waiter can start an order.
   */
  async mergeTable(cafeId: number, primaryId: number, secondaryId: number) {
    if (primaryId === secondaryId) {
      throw new BadRequestException('Cannot merge a table into itself');
    }

    const [primary, secondary] = await Promise.all([
      this.prisma.restaurantTable.findFirst({
        where: { id: primaryId, cafeId },
      }),
      this.prisma.restaurantTable.findFirst({
        where: { id: secondaryId, cafeId },
      }),
    ]);

    if (!primary) throw new NotFoundException(`Table ${primaryId} does not exist`);
    if (!secondary) throw new NotFoundException(`Table ${secondaryId} does not exist`);

    // Both tables must be free (no open orders)
    const activeOrders = await this.prisma.order.findMany({
      where: {
        cafeId,
        tableId: { in: [primaryId, secondaryId] },
        status: { notIn: ['paid', 'cancelled'] },
      },
    });
    if (activeOrders.length > 0) {
      throw new BadRequestException(
        'Both tables must be free (no active orders) to merge physically. ' +
        'Use "Transfer order" to move items between occupied tables.',
      );
    }

    // If secondary is already merged elsewhere, refuse
    if (secondary.mergedIntoId != null) {
      throw new BadRequestException(
        `Table ${secondary.tableNumber} is already part of another merged group`,
      );
    }

    await this.prisma.restaurantTable.update({
      where: { id: secondaryId },
      data: { mergedIntoId: primaryId, status: 'reserved' },
    });

    return this.findAll(cafeId);
  }

  /**
   * Undo a physical merge: restore all secondary tables that were absorbed
   * into primaryId back to 'free' status.
   */
  async unmergeTable(cafeId: number, primaryId: number) {
    const primary = await this.prisma.restaurantTable.findFirst({
      where: { id: primaryId, cafeId },
      include: { mergedFrom: true },
    });
    if (!primary) throw new NotFoundException(`Table ${primaryId} does not exist`);
    if (primary.mergedFrom.length === 0) {
      throw new BadRequestException(`Table ${primaryId} has no merged secondary tables`);
    }

    await this.prisma.restaurantTable.updateMany({
      where: { mergedIntoId: primaryId },
      data: { mergedIntoId: null, status: 'free' },
    });

    return this.findAll(cafeId);
  }

  /**
   * Called by OrdersService.recordPayment after a merged table's order is paid.
   * Restores any secondary tables (mergedIntoId = tableId) back to free.
   */
  async unmergeIfMerged(tableId: number) {
    await this.prisma.restaurantTable.updateMany({
      where: { mergedIntoId: tableId },
      data: { mergedIntoId: null, status: 'free' },
    });
  }

  async createTable(cafeId: number, dto: CreateTableDto) {
    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true },
    });

    assertNotOverdue(cafe);

    const tableCount = await this.prisma.restaurantTable.count({ where: { cafeId } });
    assertTableLimit(cafe, tableCount);

    return this.prisma.restaurantTable.create({ data: { ...dto, cafeId } });
  }

  async updateTable(cafeId: number, id: number, dto: UpdateTableDto) {
    // Scoping the lookup itself (not just checking afterwards) is what
    // stops staff at one cafe from updating -- or even learning the
    // existence of -- a table id that belongs to a different cafe.
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, cafeId } });
    if (!table) {
      throw new NotFoundException(`Table ${id} does not exist`);
    }
    return this.prisma.restaurantTable.update({ where: { id }, data: dto });
  }

  async regenerateQr(cafeId: number, id: number) {
    // Invalidates the old link outright (old printed QR codes stop working)
    // rather than layering on a second valid token -- the point of
    // regenerating is that a token you suspect is compromised or a table
    // that's being reprinted should have exactly one live link afterwards.
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, cafeId } });
    if (!table) {
      throw new NotFoundException(`Table ${id} does not exist`);
    }
    const qrToken = randomBytes(18).toString('base64url');
    return this.prisma.restaurantTable.update({ where: { id }, data: { qrToken } });
  }
}
