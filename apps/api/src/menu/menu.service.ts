import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { CreateMenuItemDto } from './dto/create-menu-item.dto.js';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { CreateModifierDto } from './dto/create-modifier.dto.js';
import { UpdateModifierDto } from './dto/update-modifier.dto.js';
import { ReorderDto, SetRecipeDto } from './dto/reorder.dto.js';
import { assertNotOverdue, assertMenuItemLimit } from '../subscription/plan-limits.js';
import { OrdersGateway } from '../orders/orders.gateway.js';

const ITEM_INCLUDE = {
  category: { select: { id: true, name: true, parentId: true, sortOrder: true } },
  modifiers: { orderBy: { id: 'asc' as const } },
};

// Menu order everywhere = category order, then the item's own order, then name.
const ITEM_ORDER = [
  { category: { sortOrder: 'asc' as const } },
  { sortOrder: 'asc' as const },
  { name: 'asc' as const },
];

@Injectable()
export class MenuService {
  constructor(
    private prisma: PrismaService,
    private gateway: OrdersGateway,
  ) {}

  // Waiter screen: only what can be ordered right now. Sold-out items are
  // still returned (isAvailable false) so they can be shown greyed out --
  // hiding them makes waiters think the app is broken.
  findAll(cafeId: number) {
    return this.prisma.menuItem.findMany({
      where: { cafeId, category: { isActive: true } },
      include: ITEM_INCLUDE,
      orderBy: ITEM_ORDER,
    });
  }

  findAllForAdmin(cafeId: number) {
    return this.prisma.menuItem.findMany({
      where: { cafeId },
      include: { ...ITEM_INCLUDE, recipe: { include: { stockItem: { select: { id: true, name: true, unit: true, avgCost: true } } } } },
      orderBy: ITEM_ORDER,
    });
  }

  async findAllCategories(cafeId: number) {
    const cats = await this.prisma.menuCategory.findMany({
      where: { cafeId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { menuItems: true } } },
    });
    return cats.map(({ _count, ...c }) => ({ ...c, itemCount: _count.menuItems }));
  }

  // Popular = top sellers over the last 30 days -- powers the waiter's
  // "Popular" tab so the most-ordered things are one tap away.
  async popular(cafeId: number, take = 12) {
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await this.prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: { voidedAt: null, order: { cafeId, status: 'paid', createdAt: { gte: since } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    });
    return rows.map((r) => r.menuItemId);
  }

  private async assertValidParent(cafeId: number, parentId: number | null | undefined, selfId?: number) {
    if (parentId == null) return;
    if (parentId === selfId) throw new BadRequestException('A category cannot be its own parent');
    const parent = await this.findCategoryOrThrow(cafeId, parentId);
    if (parent.parentId != null) {
      throw new BadRequestException('Sub-categories can only go one level deep');
    }
    if (selfId != null) {
      const children = await this.prisma.menuCategory.count({ where: { parentId: selfId } });
      if (children > 0) throw new BadRequestException('This category has sub-categories, so it cannot become one');
    }
  }

  async createCategory(cafeId: number, dto: CreateCategoryDto) {
    await this.assertValidParent(cafeId, dto.parentId);
    const max = await this.prisma.menuCategory.aggregate({ where: { cafeId }, _max: { sortOrder: true } });
    return this.prisma.menuCategory.create({
      data: {
        cafeId,
        name: dto.name.trim(),
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateCategory(cafeId: number, id: number, dto: UpdateCategoryDto) {
    await this.findCategoryOrThrow(cafeId, id);
    if (dto.parentId !== undefined) await this.assertValidParent(cafeId, dto.parentId, id);
    const updated = await this.prisma.menuCategory.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}) },
    });
    this.gateway.emitCafe(cafeId, 'menu.changed', {});
    return updated;
  }

  async deleteCategory(cafeId: number, id: number) {
    await this.findCategoryOrThrow(cafeId, id);
    const [items, children] = await Promise.all([
      this.prisma.menuItem.count({ where: { categoryId: id } }),
      this.prisma.menuCategory.count({ where: { parentId: id } }),
    ]);
    if (items > 0 || children > 0) {
      throw new BadRequestException('Move or delete its items and sub-categories first');
    }
    await this.prisma.menuCategory.delete({ where: { id } });
    return { ok: true };
  }

  async reorder(cafeId: number, dto: ReorderDto) {
    const ids = [...new Set(dto.ids)];
    const model = dto.kind === 'category' ? this.prisma.menuCategory : this.prisma.menuItem;
    // @ts-expect-error -- both delegates share count({ where }) with the fields used here
    const owned = await model.count({ where: { id: { in: ids }, cafeId } });
    if (owned !== ids.length) throw new BadRequestException('Some rows do not belong to this cafe');
    await this.prisma.$transaction(
      ids.map((id, index) =>
        dto.kind === 'category'
          ? this.prisma.menuCategory.update({ where: { id }, data: { sortOrder: index } })
          : this.prisma.menuItem.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    this.gateway.emitCafe(cafeId, 'menu.changed', {});
    return { ok: true };
  }

  async createMenuItem(cafeId: number, dto: CreateMenuItemDto) {
    await this.findCategoryOrThrow(cafeId, dto.categoryId);

    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true },
    });
    assertNotOverdue(cafe);

    const itemCount = await this.prisma.menuItem.count({ where: { cafeId } });
    assertMenuItemLimit(cafe, itemCount);

    const max = await this.prisma.menuItem.aggregate({
      where: { cafeId, categoryId: dto.categoryId },
      _max: { sortOrder: true },
    });

    const created = await this.prisma.menuItem.create({
      data: {
        ...dto,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        cafeId,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
      include: ITEM_INCLUDE,
    });
    this.gateway.emitCafe(cafeId, 'menu.changed', {});
    return created;
  }

  async updateMenuItem(cafeId: number, id: number, dto: UpdateMenuItemDto) {
    await this.findMenuItemOrThrow(cafeId, id);
    if (dto.categoryId) {
      await this.findCategoryOrThrow(cafeId, dto.categoryId);
    }
    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      },
      include: ITEM_INCLUDE,
    });
    this.gateway.emitCafe(cafeId, 'menu.changed', {});
    return updated;
  }

  // Items that were ever sold can't be hard-deleted (old bills point at
  // them) -- they get hidden instead, which is what the owner actually wants.
  async deleteMenuItem(cafeId: number, id: number) {
    await this.findMenuItemOrThrow(cafeId, id);
    const used = await this.prisma.orderItem.count({ where: { menuItemId: id } });
    if (used > 0) {
      await this.prisma.menuItem.update({ where: { id }, data: { isAvailable: false } });
      return { ok: true, archived: true };
    }
    await this.prisma.$transaction([
      this.prisma.modifier.deleteMany({ where: { menuItemId: id } }),
      this.prisma.recipeLine.deleteMany({ where: { menuItemId: id } }),
      this.prisma.menuItem.delete({ where: { id } }),
    ]);
    this.gateway.emitCafe(cafeId, 'menu.changed', {});
    return { ok: true, archived: false };
  }

  async adjustStock(cafeId: number, id: number, dto: AdjustStockDto) {
    const item = await this.findMenuItemOrThrow(cafeId, id);

    if (!item.trackStock) {
      throw new BadRequestException(
        `"${item.name}" isn't tracking stock -- turn on stock tracking before adjusting it`,
      );
    }

    const newQuantity = item.stockQuantity + dto.delta;
    if (newQuantity < 0) {
      throw new BadRequestException(
        `That would take "${item.name}" below zero (currently ${item.stockQuantity})`,
      );
    }

    return this.prisma.menuItem.update({
      where: { id },
      data: { stockQuantity: { increment: dto.delta } },
    });
  }

  async getRecipe(cafeId: number, menuItemId: number) {
    await this.findMenuItemOrThrow(cafeId, menuItemId);
    return this.prisma.recipeLine.findMany({
      where: { menuItemId },
      include: { stockItem: { select: { id: true, name: true, unit: true, avgCost: true } } },
    });
  }

  // Replace the whole recipe in one go -- simpler than line-by-line CRUD
  // and the editor always has the full list in hand anyway.
  async setRecipe(cafeId: number, menuItemId: number, dto: SetRecipeDto) {
    await this.findMenuItemOrThrow(cafeId, menuItemId);
    const stockIds = [...new Set(dto.lines.map((l) => l.stockItemId))];
    if (stockIds.length !== dto.lines.length) throw new BadRequestException('Each stock item can appear once');
    const owned = await this.prisma.stockItem.count({ where: { id: { in: stockIds }, cafeId } });
    if (owned !== stockIds.length) throw new BadRequestException('Unknown stock item');

    await this.prisma.$transaction([
      this.prisma.recipeLine.deleteMany({ where: { menuItemId } }),
      this.prisma.recipeLine.createMany({
        data: dto.lines.map((l) => ({ menuItemId, stockItemId: l.stockItemId, quantity: l.quantity })),
      }),
    ]);
    return this.getRecipe(cafeId, menuItemId);
  }

  async addModifier(cafeId: number, menuItemId: number, dto: CreateModifierDto) {
    await this.findMenuItemOrThrow(cafeId, menuItemId);
    return this.prisma.modifier.create({ data: { ...dto, menuItemId } });
  }

  async updateModifier(cafeId: number, id: number, dto: UpdateModifierDto) {
    await this.findModifierOrThrow(cafeId, id);
    return this.prisma.modifier.update({ where: { id }, data: dto });
  }

  async removeModifier(cafeId: number, id: number) {
    await this.findModifierOrThrow(cafeId, id);
    const usageCount = await this.prisma.orderItemModifier.count({ where: { modifierId: id } });
    if (usageCount > 0) {
      throw new BadRequestException(
        `This option is on ${usageCount} past order(s) and cannot be deleted -- rename it instead`,
      );
    }
    return this.prisma.modifier.delete({ where: { id } });
  }

  private async findModifierOrThrow(cafeId: number, id: number) {
    const modifier = await this.prisma.modifier.findFirst({ where: { id, menuItem: { cafeId } } });
    if (!modifier) throw new NotFoundException(`Modifier ${id} does not exist`);
    return modifier;
  }

  private async findMenuItemOrThrow(cafeId: number, id: number) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, cafeId } });
    if (!item) throw new NotFoundException(`Menu item ${id} does not exist`);
    return item;
  }

  private async findCategoryOrThrow(cafeId: number, id: number) {
    const category = await this.prisma.menuCategory.findFirst({ where: { id, cafeId } });
    if (!category) throw new NotFoundException(`Menu category ${id} does not exist`);
    return category;
  }
}
