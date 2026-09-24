import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MenuService } from './menu.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CAFE_ID = 1;

function createMockPrisma() {
  return {
    menuItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    menuCategory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    modifier: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cafe: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ plan: 'starter', subscriptionStatus: 'active' }),
    },
  } as any;
}

describe('MenuService', () => {
  let service: MenuService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [MenuService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<MenuService>(MenuService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns only available items ordered by category', async () => {
      prisma.menuItem.findMany.mockResolvedValue([{ id: 1, name: 'Latte' }]);
      const result = await service.findAll(CAFE_ID);
      expect(prisma.menuItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { cafeId: CAFE_ID, isAvailable: true },
      }));
      expect(result).toHaveLength(1);
    });
  });

  describe('createMenuItem', () => {
    const dto = { name: 'Espresso', price: 120, categoryId: 1, trackStock: false } as any;

    it('throws if the category does not belong to this cafe', async () => {
      prisma.menuCategory.findFirst.mockResolvedValue(null);
      await expect(service.createMenuItem(CAFE_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('creates the item when category exists and plan allows it', async () => {
      prisma.menuCategory.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID });
      prisma.menuItem.create.mockResolvedValue({ id: 10, name: 'Espresso', cafeId: CAFE_ID });

      const result = await service.createMenuItem(CAFE_ID, dto);

      expect(prisma.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cafeId: CAFE_ID, name: 'Espresso' }) }),
      );
      expect(result.name).toBe('Espresso');
    });
  });

  describe('updateMenuItem', () => {
    it('throws if the item does not exist for this cafe', async () => {
      prisma.menuItem.findFirst.mockResolvedValue(null);
      await expect(service.updateMenuItem(CAFE_ID, 99, { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });

    it('updates the item when it exists', async () => {
      prisma.menuItem.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID });
      prisma.menuItem.update.mockResolvedValue({ id: 1, name: 'Flat White' });

      const result = await service.updateMenuItem(CAFE_ID, 1, { name: 'Flat White' } as any);
      expect(result.name).toBe('Flat White');
    });
  });

  describe('adjustStock', () => {
    it('throws if stock tracking is not enabled on the item', async () => {
      prisma.menuItem.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, trackStock: false, name: 'Latte', stockQuantity: 10 });
      await expect(service.adjustStock(CAFE_ID, 1, { delta: 5 })).rejects.toThrow(BadRequestException);
    });

    it('applies the delta to the current stock quantity', async () => {
      prisma.menuItem.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, trackStock: true, name: 'Mo:Mo', stockQuantity: 20 });
      prisma.menuItem.update.mockResolvedValue({ id: 1, stockQuantity: 25 });

      await service.adjustStock(CAFE_ID, 1, { delta: 5 });

      expect(prisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { stockQuantity: 25 } }),
      );
    });
  });

  describe('createCategory', () => {
    it('creates a category scoped to the cafe', async () => {
      prisma.menuCategory.create.mockResolvedValue({ id: 5, name: 'Desserts', cafeId: CAFE_ID });
      const result = await service.createCategory(CAFE_ID, { name: 'Desserts', sortOrder: 3 });
      expect(prisma.menuCategory.create).toHaveBeenCalledWith({
        data: { name: 'Desserts', sortOrder: 3, cafeId: CAFE_ID },
      });
      expect(result.name).toBe('Desserts');
    });
  });

  describe('updateCategory', () => {
    it('throws if the category does not belong to this cafe', async () => {
      prisma.menuCategory.findFirst.mockResolvedValue(null);
      await expect(service.updateCategory(CAFE_ID, 99, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('updates when the category is found', async () => {
      prisma.menuCategory.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, name: 'Snacks' });
      prisma.menuCategory.update.mockResolvedValue({ id: 1, name: 'Light Bites' });

      const result = await service.updateCategory(CAFE_ID, 1, { name: 'Light Bites' });
      expect(result.name).toBe('Light Bites');
    });
  });
});
