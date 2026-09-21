import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrdersService } from './orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersGateway } from './orders.gateway.js';
import { Prisma } from '../generated/prisma/client.js';

// A hand-rolled Prisma mock rather than a real DB: fast, and it forces us to
// state exactly which Prisma calls each service method is expected to make.
// $transaction just runs the callback against this same mock, since none of
// these tests need real transactional isolation -- only the sequence of
// calls the service makes inside it.
const CAFE_ID = 1;

function createMockPrisma() {
  const prisma: any = {
    order: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    orderItemModifier: {
      createMany: vi.fn(),
    },
    restaurantTable: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    menuItem: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    payment: {
      create: vi.fn(),
    },
  };
  prisma.$transaction = vi.fn((callback: (tx: unknown) => unknown) => callback(prisma));
  return prisma;
}

function createMockGateway() {
  return {
    emitOrderSentToKitchen: vi.fn(),
    emitOrderItemReady: vi.fn(),
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let gateway: ReturnType<typeof createMockGateway>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    gateway = createMockGateway();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = { tableId: 1, waiterId: 2, orderType: 'dine_in' } as any;

    it('throws if the table does not exist for this cafe', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue(null);

      await expect(service.create(CAFE_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws if the table is not free', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'occupied' });

      await expect(service.create(CAFE_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('throws if the waiter does not belong to this cafe', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'free' });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.create(CAFE_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('creates the order and marks the table occupied', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'free' });
      prisma.user.findFirst.mockResolvedValue({ id: 2, cafeId: CAFE_ID });
      prisma.order.create.mockResolvedValue({ id: 10, cafeId: CAFE_ID, tableId: 1, status: 'pending' });

      const result = await service.create(CAFE_ID, dto);

      expect(prisma.order.create).toHaveBeenCalledWith({
        data: { cafeId: CAFE_ID, tableId: 1, waiterId: 2, orderType: 'dine_in' },
      });
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'occupied' },
      });
      expect(result).toEqual({ id: 10, cafeId: CAFE_ID, tableId: 1, status: 'pending' });
    });
  });

  describe('addItem', () => {
    const dto = { menuItemId: 5, quantity: 2 } as any;

    it('throws if the order does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.addItem(CAFE_ID, 1, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order status cannot take new items', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'billed' });

      await expect(service.addItem(CAFE_ID, 1, dto)).rejects.toThrow(BadRequestException);
    });

    it('throws if the menu item does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'pending' });
      prisma.menuItem.findFirst.mockResolvedValue(null);

      await expect(service.addItem(CAFE_ID, 1, dto)).rejects.toThrow(NotFoundException);
    });

    it('adds the item without reopening an order that is still pending/preparing', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'preparing' });
      prisma.menuItem.findFirst.mockResolvedValue({ id: 5, price: new Prisma.Decimal(100) });
      prisma.orderItem.create.mockResolvedValue({ id: 99 });
      prisma.orderItem.findUnique.mockResolvedValue({ id: 99, orderId: 1 });

      await service.addItem(CAFE_ID, 1, dto);

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(gateway.emitOrderSentToKitchen).not.toHaveBeenCalled();
    });

    it('reopens a served order back to preparing and notifies the kitchen', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'served' });
      prisma.menuItem.findFirst.mockResolvedValue({ id: 5, price: new Prisma.Decimal(100) });
      prisma.orderItem.create.mockResolvedValue({ id: 99 });
      prisma.orderItem.findUnique.mockResolvedValue({ id: 99, orderId: 1 });

      await service.addItem(CAFE_ID, 1, dto);

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'preparing' },
      });
      expect(gateway.emitOrderSentToKitchen).toHaveBeenCalledWith(CAFE_ID, { orderId: 1 });
    });
  });

  describe('sendToKitchen', () => {
    it('throws if the order does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.sendToKitchen(CAFE_ID, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not pending', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'preparing', orderItems: [] });

      await expect(service.sendToKitchen(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if the order has no items', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'pending', orderItems: [] });

      await expect(service.sendToKitchen(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });

    it('moves the order to preparing and notifies the kitchen', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1,
        cafeId: CAFE_ID,
        status: 'pending',
        orderItems: [{ id: 1 }],
      });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'preparing' });

      const result = await service.sendToKitchen(CAFE_ID, 1);

      expect(result.status).toBe('preparing');
      expect(gateway.emitOrderSentToKitchen).toHaveBeenCalledWith(CAFE_ID, { orderId: 1 });
    });
  });

  describe('markItemReady', () => {
    it('throws if the order item does not exist for this cafe', async () => {
      prisma.orderItem.findFirst.mockResolvedValue(null);

      await expect(service.markItemReady(CAFE_ID, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the item is not pending', async () => {
      prisma.orderItem.findFirst.mockResolvedValue({ id: 1, status: 'ready' });

      await expect(service.markItemReady(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });

    it('scopes the lookup through the parent order', async () => {
      prisma.orderItem.findFirst.mockResolvedValue({ id: 1, status: 'pending' });
      prisma.orderItem.update.mockResolvedValue({ id: 1, orderId: 7, status: 'ready' });

      await service.markItemReady(CAFE_ID, 1);

      expect(prisma.orderItem.findFirst).toHaveBeenCalledWith({
        where: { id: 1, order: { cafeId: CAFE_ID } },
      });
      expect(gateway.emitOrderItemReady).toHaveBeenCalledWith(CAFE_ID, { orderId: 7, orderItemId: 1 });
    });
  });

  describe('serve', () => {
    it('throws if the order does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.serve(CAFE_ID, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not preparing', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'served', orderItems: [] });

      await expect(service.serve(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if any item is still pending in the kitchen', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1,
        cafeId: CAFE_ID,
        status: 'preparing',
        orderItems: [{ status: 'ready' }, { status: 'pending' }],
      });

      await expect(service.serve(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });

    it('serves the order once every item has cleared pending', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1,
        cafeId: CAFE_ID,
        status: 'preparing',
        orderItems: [{ status: 'ready' }, { status: 'served' }],
      });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'served' });

      await service.serve(CAFE_ID, 1);

      expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({
        where: { orderId: 1, status: 'ready' },
        data: { status: 'served' },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'served' },
      });
    });
  });

  describe('cancel', () => {
    it('throws if the order does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.cancel(CAFE_ID, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not pending', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'preparing', tableId: 3 });

      await expect(service.cancel(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });

    it('cancels the order and frees the table', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'pending', tableId: 3 });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'cancelled' });

      await service.cancel(CAFE_ID, 1);

      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { status: 'free' },
      });
    });
  });

  describe('generateBill', () => {
    it('throws if the order does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.generateBill(CAFE_ID, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not served', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'preparing', orderItems: [] });

      await expect(service.generateBill(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });

    it('totals line items plus their modifiers', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1,
        cafeId: CAFE_ID,
        status: 'served',
        orderItems: [
          {
            price: new Prisma.Decimal(100),
            quantity: 2,
            orderItemModifiers: [{ modifier: { priceDelta: new Prisma.Decimal(20) } }],
          },
          {
            price: new Prisma.Decimal(50),
            quantity: 1,
            orderItemModifiers: [],
          },
        ],
      });
      prisma.order.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));

      // (100 + 20) * 2 + 50 * 1 = 290
      const result = await service.generateBill(CAFE_ID, 1);

      expect(result.total!.toString()).toBe('290');
      expect(result.status).toBe('billed');
    });
  });

  describe('reopenToServed', () => {
    it('throws if the order does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.reopenToServed(CAFE_ID, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not billed', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'served' });

      await expect(service.reopenToServed(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });

    it('reopens a billed order back to served and clears the total', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'billed' });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'served', total: null });

      await service.reopenToServed(CAFE_ID, 1);

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'served', total: null },
      });
    });
  });

  describe('recordPayment', () => {
    const dto = { method: 'cash' } as any;

    it('throws if the order does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.recordPayment(CAFE_ID, 1, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not billed', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'served' });

      await expect(service.recordPayment(CAFE_ID, 1, dto)).rejects.toThrow(BadRequestException);
    });

    it('records the payment, marks the order paid, and frees the table', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1,
        cafeId: CAFE_ID,
        status: 'billed',
        tableId: 4,
        total: new Prisma.Decimal(290),
      });
      prisma.payment.create.mockResolvedValue({ id: 1, orderId: 1, amount: new Prisma.Decimal(290) });

      await service.recordPayment(CAFE_ID, 1, dto);

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'paid' },
      });
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: { status: 'free' },
      });
    });
  });

  describe('findOne', () => {
    it('throws if the order does not exist for this cafe', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.findOne(CAFE_ID, 1)).rejects.toThrow(NotFoundException);
    });

    it('returns the order when found', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, cafeId: CAFE_ID, status: 'pending' });

      const result = await service.findOne(CAFE_ID, 1);

      expect(result).toEqual({ id: 1, cafeId: CAFE_ID, status: 'pending' });
    });
  });
});
