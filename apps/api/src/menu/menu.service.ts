import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { CreateMenuItemDto } from './dto/create-menu-item.dto.js';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { CreateModifierDto } from './dto/create-modifier.dto.js';
import { UpdateModifierDto } from './dto/update-modifier.dto.js';

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  findAll(cafeId: number) {
    return this.prisma.menuItem.findMany({
      where: { cafeId, isAvailable: true },
      include: { category: true, modifiers: true },
      orderBy: { category: { sortOrder: 'asc' } },
    });
  }

  findAllForAdmin(cafeId: number) {
    return this.prisma.menuItem.findMany({
      where: { cafeId },
      include: { category: true, modifiers: true },
      orderBy: { category: { sortOrder: 'asc' } },
    });
  }

  findAllCategories(cafeId: number) {
    return this.prisma.menuCategory.findMany({ where: { cafeId }, orderBy: { sortOrder: 'asc' } });
  }

  createCategory(cafeId: number, dto: CreateCategoryDto) {
    return this.prisma.menuCategory.create({ data: { ...dto, cafeId } });
  }

  async updateCategory(cafeId: number, id: number, dto: UpdateCategoryDto) {
    await this.findCategoryOrThrow(cafeId, id);
    return this.prisma.menuCategory.update({ where: { id }, data: dto });
  }

  async createMenuItem(cafeId: number, dto: CreateMenuItemDto) {
    // The category has to belong to the same cafe as the item, or a menu
    // item could end up filed under another cafe's category.
    await this.findCategoryOrThrow(cafeId, dto.categoryId);
    return this.prisma.menuItem.create({ data: { ...dto, cafeId } });
  }

  async updateMenuItem(cafeId: number, id: number, dto: UpdateMenuItemDto) {
    await this.findMenuItemOrThrow(cafeId, id);
    if (dto.categoryId) {
      await this.findCategoryOrThrow(cafeId, dto.categoryId);
    }
    return this.prisma.menuItem.update({ where: { id }, data: dto });
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
        `Modifier ${id} is used on ${usageCount} existing order item(s) and cannot be deleted`,
      );
    }
    return this.prisma.modifier.delete({ where: { id } });
  }

  // Modifiers and menu items don't carry cafeId directly (see schema
  // comments), so scoping them means joining up to the cafe-owned parent --
  // findFirst with a nested where is how Prisma expresses "this child row,
  // but only if its parent belongs to this cafe."
  private async findModifierOrThrow(cafeId: number, id: number) {
    const modifier = await this.prisma.modifier.findFirst({
      where: { id, menuItem: { cafeId } },
    });
    if (!modifier) {
      throw new NotFoundException(`Modifier ${id} does not exist`);
    }
    return modifier;
  }

  private async findMenuItemOrThrow(cafeId: number, id: number) {
    const item = await this.prisma.menuItem.findFirst({ where: { id, cafeId } });
    if (!item) {
      throw new NotFoundException(`Menu item ${id} does not exist`);
    }
    return item;
  }

  private async findCategoryOrThrow(cafeId: number, id: number) {
    const category = await this.prisma.menuCategory.findFirst({ where: { id, cafeId } });
    if (!category) {
      throw new NotFoundException(`Menu category ${id} does not exist`);
    }
    return category;
  }
}
