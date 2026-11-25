import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import {
  CreatePurchaseDto, CreateStockItemDto, MovementsQueryDto, StockCountDto, StockOutDto,
  SupplierDto, UpdateStockItemDto,
} from './dto/inventory.dto.js';

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
type Actor = Pick<CurrentUserPayload, 'userId' | 'name'>;

// Inventory is a ledger: every change is a StockMovement row, and
// StockItem.currentQty is only a cached running total of those rows,
// updated in the same transaction. That way "why is milk at -2?" always
// has an answer -- you can read the movements.
@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async listItems(cafeId: number) {
    const items = await this.prisma.stockItem.findMany({
      where: { cafeId },
      orderBy: [{ isActive: 'desc' }, { kind: 'asc' }, { name: 'asc' }],
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, type: true } },
        _count: { select: { recipeLines: true } },
      },
    });
    return items.map(({ movements, _count, ...i }) => ({
      ...i,
      status: i.currentQty.lte(0) ? 'out' : i.currentQty.lte(i.lowStockThreshold) ? 'low' : 'ok',
      value: i.currentQty.gt(0) ? i.currentQty.times(i.avgCost).toFixed(2) : '0.00',
      lastMovementAt: movements[0]?.createdAt ?? null,
      usedInRecipes: _count.recipeLines,
    }));
  }

  async lowStockCount(cafeId: number) {
    const items = await this.prisma.stockItem.findMany({
      where: { cafeId, isActive: true },
      select: { currentQty: true, lowStockThreshold: true },
    });
    return { count: items.filter((i) => i.currentQty.lte(i.lowStockThreshold)).length };
  }

  async createItem(cafeId: number, dto: CreateStockItemDto, actor: Actor) {
    const exists = await this.prisma.stockItem.findFirst({ where: { cafeId, name: dto.name.trim() } });
    if (exists) throw new BadRequestException(`"${dto.name}" already exists`);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.create({
        data: {
          cafeId,
          name: dto.name.trim(),
          kind: dto.kind,
          unit: dto.unit,
          lowStockThreshold: dto.lowStockThreshold ?? 0,
          avgCost: dto.unitCost ?? 0,
          currentQty: dto.openingQty ?? 0,
        },
      });
      if (dto.openingQty && dto.openingQty > 0) {
        await tx.stockMovement.create({
          data: {
            cafeId, stockItemId: item.id, type: 'opening', quantity: dto.openingQty,
            unitCost: dto.unitCost ?? null, reason: 'Opening stock', createdById: actor.userId,
          },
        });
      }
      return item;
    });
  }

  async updateItem(cafeId: number, id: number, dto: UpdateStockItemDto) {
    await this.findItemOrThrow(cafeId, id);
    return this.prisma.stockItem.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}) },
    });
  }

  async stockOut(cafeId: number, dto: StockOutDto, actor: Actor) {
    const item = await this.findItemOrThrow(cafeId, dto.stockItemId);
    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          cafeId, stockItemId: item.id, type: dto.type, quantity: -dto.quantity,
          unitCost: item.avgCost, reason: dto.reason?.trim() || null, createdById: actor.userId,
        },
      });
      await tx.stockItem.update({ where: { id: item.id }, data: { currentQty: { decrement: dto.quantity } } });
      await this.audit.log(cafeId, actor, `stock.${dto.type}`, 'stockItem', item.id, {
        item: item.name, quantity: dto.quantity, unit: item.unit, reason: dto.reason,
        value: item.avgCost.times(dto.quantity).toFixed(2),
      }, tx);
      return movement;
    });
  }

  async createPurchase(cafeId: number, dto: CreatePurchaseDto, actor: Actor) {
    const ids = [...new Set(dto.lines.map((l) => l.stockItemId))];
    const items = await this.prisma.stockItem.findMany({ where: { id: { in: ids }, cafeId } });
    if (items.length !== ids.length) throw new BadRequestException('Unknown stock item in purchase');

    let supplierId = dto.supplierId ?? null;
    if (supplierId) {
      const s = await this.prisma.supplier.findFirst({ where: { id: supplierId, cafeId } });
      if (!s) throw new NotFoundException('Supplier not found');
    }

    return this.prisma.$transaction(async (tx) => {
      if (!supplierId && dto.supplierName?.trim()) {
        const s = await tx.supplier.upsert({
          where: { cafeId_name: { cafeId, name: dto.supplierName.trim() } },
          update: {},
          create: { cafeId, name: dto.supplierName.trim() },
        });
        supplierId = s.id;
      }

      const total = dto.lines.reduce((s, l) => s.plus(l.lineTotal), D(0));
      const purchase = await tx.purchase.create({
        data: {
          cafeId,
          supplierId,
          purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : new Date(),
          billRef: dto.billRef?.trim() || null,
          note: dto.note?.trim() || null,
          total,
          createdById: actor.userId,
        },
      });

      for (const line of dto.lines) {
        const unitCost = D(line.lineTotal).dividedBy(line.quantity).toDecimalPlaces(4);
        await tx.purchaseLine.create({
          data: {
            purchaseId: purchase.id, stockItemId: line.stockItemId,
            quantity: line.quantity, unitCost, lineTotal: line.lineTotal,
          },
        });
        await tx.stockMovement.create({
          data: {
            cafeId, stockItemId: line.stockItemId, type: 'purchase', quantity: line.quantity, unitCost,
            refType: 'purchase', refId: purchase.id, createdById: actor.userId,
          },
        });

        // Weighted average cost: blend what's on the shelf with what just arrived.
        const current = await tx.stockItem.findUniqueOrThrow({ where: { id: line.stockItemId } });
        const onHand = Prisma.Decimal.max(current.currentQty, 0);
        const newQty = onHand.plus(line.quantity);
        const avgCost = newQty.gt(0)
          ? onHand.times(current.avgCost).plus(line.lineTotal).dividedBy(newQty).toDecimalPlaces(4)
          : unitCost;
        await tx.stockItem.update({
          where: { id: line.stockItemId },
          data: { currentQty: { increment: line.quantity }, avgCost },
        });
      }

      return tx.purchase.findUnique({
        where: { id: purchase.id },
        include: { supplier: true, lines: { include: { stockItem: { select: { name: true, unit: true } } } } },
      });
    });
  }

  listPurchases(cafeId: number, q: MovementsQueryDto) {
    return this.prisma.purchase.findMany({
      where: { cafeId, ...this.range('purchasedAt', q) },
      orderBy: { purchasedAt: 'desc' },
      take: 300,
      include: { supplier: true, lines: { include: { stockItem: { select: { name: true, unit: true } } } } },
    });
  }

  // A stock count replaces "what the system thinks" with "what's on the
  // shelf". The difference is posted as a 'count' movement so the variance
  // (theft, spillage, mis-entry) is visible rather than silently overwritten.
  async postCount(cafeId: number, dto: StockCountDto, actor: Actor) {
    const ids = dto.lines.map((l) => l.stockItemId);
    const items = await this.prisma.stockItem.findMany({ where: { id: { in: ids }, cafeId } });
    if (items.length !== new Set(ids).size) throw new BadRequestException('Unknown stock item in count');

    return this.prisma.$transaction(async (tx) => {
      const variances: { name: string; expected: string; counted: string; diff: string; value: string }[] = [];
      for (const line of dto.lines) {
        const item = items.find((i) => i.id === line.stockItemId)!;
        const fresh = await tx.stockItem.findUniqueOrThrow({ where: { id: item.id } });
        const diff = D(line.countedQty).minus(fresh.currentQty);
        if (diff.isZero()) continue;
        await tx.stockMovement.create({
          data: {
            cafeId, stockItemId: item.id, type: 'count', quantity: diff, unitCost: fresh.avgCost,
            reason: dto.note?.trim() || 'Stock count', refType: 'count', createdById: actor.userId,
          },
        });
        await tx.stockItem.update({ where: { id: item.id }, data: { currentQty: line.countedQty } });
        variances.push({
          name: item.name, expected: fresh.currentQty.toFixed(3), counted: String(line.countedQty),
          diff: diff.toFixed(3), value: diff.times(fresh.avgCost).toFixed(2),
        });
      }
      if (variances.length > 0) {
        await this.audit.log(cafeId, actor, 'stock.count', 'stockItem', null, { variances }, tx);
      }
      return { adjusted: variances.length, variances };
    });
  }

  listMovements(cafeId: number, q: MovementsQueryDto) {
    return this.prisma.stockMovement.findMany({
      where: { cafeId, ...(q.stockItemId ? { stockItemId: q.stockItemId } : {}), ...this.range('createdAt', q) },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { stockItem: { select: { name: true, unit: true } } },
    });
  }

  listSuppliers(cafeId: number) {
    return this.prisma.supplier.findMany({
      where: { cafeId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { purchases: true } } },
    });
  }

  createSupplier(cafeId: number, dto: SupplierDto) {
    return this.prisma.supplier.create({ data: { ...dto, name: dto.name.trim(), cafeId } });
  }

  async updateSupplier(cafeId: number, id: number, dto: SupplierDto) {
    const s = await this.prisma.supplier.findFirst({ where: { id, cafeId } });
    if (!s) throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.update({ where: { id }, data: { ...dto, name: dto.name.trim() } });
  }

  private range(field: 'createdAt' | 'purchasedAt', q: { from?: string; to?: string }) {
    if (!q.from && !q.to) return {};
    const to = q.to ? new Date(q.to) : undefined;
    if (to && q.to!.length <= 10) to.setUTCHours(23, 59, 59, 999);
    return { [field]: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(to ? { lte: to } : {}) } };
  }

  private async findItemOrThrow(cafeId: number, id: number) {
    const item = await this.prisma.stockItem.findFirst({ where: { id, cafeId } });
    if (!item) throw new NotFoundException('Stock item not found');
    return item;
  }
}
