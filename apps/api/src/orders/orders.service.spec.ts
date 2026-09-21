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
function createMockPrisma() {
  const prisma: any = {
    order: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItem: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItemModifier: {
      createMany: vi.fn(),
    },
    restaurantTable: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    menuItem: {
      findUnique: vi.fn(),
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
    it('throws if the table does not exist', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ tableId: 1, waiterId: 2, orderType: 'dine_in' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if the table is not free', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: 1, status: 'occupied' });

      await expect(
        service.create({ tableId: 1, waiterId: 2, orderType: 'dine_in' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the order and marks the table occupied', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({ id: 1, status: 'free' });
      prisma.order.create.mockResolvedValue({ id: 10, tableId: 1, status: 'pending' });

      const result = await service.create({ tableId: 1, waiterId: 2, orderType: 'dine_in' } as any);

      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'occupied' },
      });
      expect(result).toEqual({ id: 10, tableId: 1, status: 'pending' });
    });
  });

  describe('addItem', () => {
    const dto = { menuItemId: 5, quantity: 2 } as any;

    it('throws if the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.addItem(1, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order status cannot take new items', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'billed' });

      await expect(service.addItem(1, dto)).rejects.toThrow(BadRequestException);
    });

    it('throws if the menu item does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'pending' });
      prisma.menuItem.findUnique.mockResolvedValue(null);

      await expect(service.addItem(1, dto)).rejects.toThrow(NotFoundException);
    });

    it('adds the item without reopening an order that is still pending/preparing', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'preparing' });
      prisma.menuItem.findUnique.mockResolvedValue({ id: 5, price: new Prisma.Decimal(100) });
      prisma.orderItem.create.mockResolvedValue({ id: 99 });
      prisma.orderItem.findUnique.mockResolvedValue({ id: 99, orderId: 1 });

      await service.addItem(1, dto);

      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(gateway.emitOrderSentToKitchen).not.toHaveBeenCalled();
    });

    it('reopens a served order back to preparing and notifies the kitchen', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'served' });
      prisma.menuItem.findUnique.mockResolvedValue({ id: 5, price: new Prisma.Decimal(100) });
      prisma.orderItem.create.mockResolvedValue({ id: 99 });
      prisma.orderItem.findUnique.mockResolvedValue({ id: 99, orderId: 1 });

      await service.addItem(1, dto);

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'preparing' },
      });
      expect(gateway.emitOrderSentToKitchen).toHaveBeenCalledWith({ orderId: 1 });
    });
  });

  describe('sendToKitchen', () => {
    it('throws if the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.sendToKitchen(1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not pending', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'preparing', orderItems: [] });

      await expect(service.sendToKitchen(1)).rejects.toThrow(BadRequestException);
    });

    it('throws if the order has no items', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'pending', orderItems: [] });

      await expect(service.sendToKitchen(1)).rejects.toThrow(BadRequestException);
    });

    it('moves the order to preparing and notifies the kitchen', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 1,
        status: 'pending',
        orderItems: [{ id: 1 }],
      });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'preparing' });

      const result = await service.sendToKitchen(1);

      expect(result.status).toBe('preparing');
      expect(gateway.emitOrderSentToKitchen).toHaveBeenCalledWith({ orderId: 1 });
    });
  });

  describe('markItemReady', () => {
    it('throws if the order item does not exist', async () => {
      prisma.orderItem.findUnique.mockResolvedValue(null);

      await expect(service.markItemReady(1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the item is not pending', async () => {
      prisma.orderItem.findUnique.mockResolvedValue({ id: 1, status: 'ready' });

      await expect(service.markItemReady(1)).rejects.toThrow(BadRequestException);
    });

    it('marks the item ready and notifies the waiter', async () => {
      prisma.orderItem.findUnique.mockResolvedValue({ id: 1, status: 'pending' });
      prisma.orderItem.update.mockResolvedValue({ id: 1, orderId: 7, status: 'ready' });

      await service.markItemReady(1);

      expect(gateway.emitOrderItemReady).toHaveBeenCalledWith({ orderId: 7, orderItemId: 1 });
    });
  });

  describe('serve', () => {
    it('throws if the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.serve(1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not preparing', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'served', orderItems: [] });

      await expect(service.serve(1)).rejects.toThrow(BadRequestException);
    });

    it('throws if any item is still pending in the kitchen', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 1,
        status: 'preparing',
        orderItems: [{ status: 'ready' }, { status: 'pending' }],
      });

      await expect(service.serve(1)).rejects.toThrow(BadRequestException);
    });

    it('serves the order once every item has cleared pending', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 1,
        status: 'preparing',
        orderItems: [{ status: 'ready' }, { status: 'served' }],
      });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'served' });

      await service.serve(1);

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
    it('throws if the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.cancel(1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not pending', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'preparing', tableId: 3 });

      await expect(service.cancel(1)).rejects.toThrow(BadRequestException);
    });

    it('cancels the order and frees the table', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'pending', tableId: 3 });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'cancelled' });

      await service.cancel(1);

      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { status: 'free' },
      });
    });
  });

  describe('generateBill', () => {
    it('throws if the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.generateBill(1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not served', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'preparing', orderItems: [] });

      await expect(service.generateBill(1)).rejects.toThrow(BadRequestException);
    });

    it('totals line items plus their modifiers', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 1,
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
      const result = await service.generateBill(1);

      expect(result.total!.toString()).toBe('290');
      expect(result.status).toBe('billed');
    });
  });

  describe('reopenToServed', () => {
    it('throws if the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.reopenToServed(1)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not billed', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'served' });

      await expect(service.reopenToServed(1)).rejects.toThrow(BadRequestException);
    });

    it('reopens a billed order back to served and clears the total', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'billed' });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'served', total: null });

      await service.reopenToServed(1);

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'served', total: null },
      });
    });
  });

  describe('recordPayment', () => {
    const dto = { method: 'cash' } as any;

    it('throws if the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.recordPayment(1, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws if the order is not billed', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'served' });

      await expect(service.recordPayment(1, dto)).rejects.toThrow(BadRequestException);
    });

    it('records the payment, marks the order paid, and frees the table', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 1,
        status: 'billed',
        tableId: 4,
        total: new Prisma.Decimal(290),
      });
      prisma.payment.create.mockResolvedValue({ id: 1, orderId: 1, amount: new Prisma.Decimal(290) });

      await service.recordPayment(1, dto);

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
    it('throws if the order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });

    it('returns the order when found', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 1, status: 'pending' });

      const result = await service.findOne(1);

      expect(result).toEqual({ id: 1, status: 'pending' });
    });
  });
});
