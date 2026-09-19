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

  findAll() {
    return this.prisma.menuItem.findMany({
      where: { isAvailable: true },
      include: { category: true, modifiers: true },
      orderBy: { category: { sortOrder: 'asc' } },
    });
  }

  findAllForAdmin() {
    return this.prisma.menuItem.findMany({
      include: { category: true, modifiers: true },
      orderBy: { category: { sortOrder: 'asc' } },
    });
  }

  findAllCategories() {
    return this.prisma.menuCategory.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.menuCategory.create({ data: dto });
  }

  async updateCategory(id: number, dto: UpdateCategoryDto) {
    await this.findCategoryOrThrow(id);
    return this.prisma.menuCategory.update({ where: { id }, data: dto });
  }

  createMenuItem(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({ data: dto });
  }

  async updateMenuItem(id: number, dto: UpdateMenuItemDto) {
    await this.findMenuItemOrThrow(id);
    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  async addModifier(menuItemId: number, dto: CreateModifierDto) {
    await this.findMenuItemOrThrow(menuItemId);
    return this.prisma.modifier.create({ data: { ...dto, menuItemId } });
  }

  async updateModifier(id: number, dto: UpdateModifierDto) {
    await this.findModifierOrThrow(id);
    return this.prisma.modifier.update({ where: { id }, data: dto });
  }

  async removeModifier(id: number) {
    await this.findModifierOrThrow(id);
    const usageCount = await this.prisma.orderItemModifier.count({ where: { modifierId: id } });
    if (usageCount > 0) {
      throw new BadRequestException(
        `Modifier ${id} is used on ${usageCount} existing order item(s) and cannot be deleted`,
      );
    }
    return this.prisma.modifier.delete({ where: { id } });
  }

  private async findModifierOrThrow(id: number) {
    const modifier = await this.prisma.modifier.findUnique({ where: { id } });
    if (!modifier) {
      throw new NotFoundException(`Modifier ${id} does not exist`);
    }
    return modifier;
  }

  private async findMenuItemOrThrow(id: number) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Menu item ${id} does not exist`);
    }
    return item;
  }

  private async findCategoryOrThrow(id: number) {
    const category = await this.prisma.menuCategory.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Menu category ${id} does not exist`);
    }
    return category;
  }
}
