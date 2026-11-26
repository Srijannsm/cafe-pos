import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrdersService, computeTotals } from './orders.service.js';
import { NotificationsService } from './notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersGateway } from './orders.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { Prisma } from '../generated/prisma/client.js';

const CAFE_ID = 1;
const D = (v: number | string) => new Prisma.Decimal(v);
const ADMIN = { userId: 1, name: 'Owner', role: 'admin' };
const WAITER = { userId: 2, name: 'Sita', role: 'waiter' };
const CASHIER = { userId: 3, name: 'Ram', role: 'cashier' };

function createMockPrisma() {
  const prisma: any = {
    cafe: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ plan: 'starter', subscriptionStatus: 'active' }),
      update: vi.fn().mockResolvedValue({ lastBillNumber: 7 }),
    },
    order: {
      findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      // The in-transaction re-read after the row lock; tests set it per case.
      findUniqueOrThrow: vi.fn(),
    },
    orderItem: {
      findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(),
      delete: vi.fn(), count: vi.fn().mockResolvedValue(0),
      // matching unsent lines for the merge check -- none by default
      findMany: vi.fn().mockResolvedValue([]),
    },
    orderItemModifier: { createMany: vi.fn(), deleteMany: vi.fn() },
    restaurantTable: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    menuItem: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    user: { findFirst: vi.fn() },
    payment: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    shift: { findFirst: vi.fn().mockResolvedValue(null) },
    recipeLine: { findMany: vi.fn().mockResolvedValue([]) },
    stockMovement: { create: vi.fn() },
    stockItem: { update: vi.fn() },
  };
  prisma.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  // Row locks (SELECT ... FOR UPDATE) -- nothing to return in a unit test.
  prisma.$queryRaw = vi.fn().mockResolvedValue([]);
  return prisma;
}

const cafeBilling = (over: Partial<Record<string, unknown>> = {}) => ({
  vatEnabled: false, vatRate: D(13), serviceChargeRate: D(0), pricesIncludeVat: false, ...over,
});
const line = (price: number, qty: number, mods: number[] = [], voided = false) => ({
  price: D(price), quantity: qty, voidedAt: voided ? new Date() : null,
  orderItemModifiers: mods.map((m) => ({ modifier: { priceDelta: D(m) } })),
});

describe('computeTotals', () => {
  it('adds modifiers and skips voided lines', () => {
    const t = computeTotals([line(100, 2, [20]), line(500, 1, [], true)], { type: null, value: null }, cafeBilling());
    expect(t.subtotal.toFixed(2)).toBe('240.00');
    expect(t.total.toFixed(2)).toBe('240.00');
  });

  it('applies a percent discount before service charge and VAT', () => {
    const t = computeTotals([line(1000, 1)], { type: 'percent', value: D(10) }, cafeBilling({ vatEnabled: true, serviceChargeRate: D(10) }));
    expect(t.discountAmount.toFixed(2)).toBe('100.00');
    expect(t.serviceCharge.toFixed(2)).toBe('90.00'); // 10% of 900
    expect(t.vatAmount.toFixed(2)).toBe('128.70'); // 13% of 990
    expect(t.total.toFixed(2)).toBe('1118.70');
  });

  it('never lets a flat discount exceed the subtotal', () => {
    const t = computeTotals([line(200, 1)], { type: 'flat', value: D(500) }, cafeBilling());
    expect(t.total.toFixed(2)).toBe('0.00');
  });

  it('back-calculates VAT when menu prices already include it', () => {
    const t = computeTotals([line(1130, 1)], { type: null, value: null }, cafeBilling({ vatEnabled: true, pricesIncludeVat: true }));
    expect(t.vatAmount.toFixed(2)).toBe('130.00');
    expect(t.total.toFixed(2)).toBe('1130.00');
  });
});

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof createMockPrisma>;
  const gateway = { emitOrderSentToKitchen: vi.fn(), emitOrderItemReady: vi.fn(), emitCafe: vi.fn(), emitFloorChanged: vi.fn() };
  const audit = { log: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersGateway, useValue: gateway },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: { notify: vi.fn() } },
      ],
    }).compile();
    service = module.get(OrdersService);
  });

  describe('create', () => {
    const dto = { tableId: 1, waiterId: 2, orderType: 'dine_in' } as any;

    it('throws if the table does not exist for this cafe', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue(null);
      await expect(service.create(CAFE_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('throws if the table really is busy', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 1, tableNumber: '1', status: 'occupied' });
      prisma.order.findFirst.mockResolvedValue({ id: 99 });
      await expect(service.create(CAFE_ID, dto)).rejects.toThrow(BadRequestException);
    });

    it('creates a staff order and occupies the table', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 1, status: 'free' });
      prisma.user.findFirst.mockResolvedValue({ id: 2 });
      prisma.order.create.mockResolvedValue({ id: 10 });
      await service.create(CAFE_ID, dto);
      expect(prisma.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cafeId: CAFE_ID, tableId: 1, waiterId: 2, source: 'staff' }),
      });
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'occupied' } });
      expect(gateway.emitFloorChanged).toHaveBeenCalledWith(CAFE_ID);
    });
  });

  describe('addItem', () => {
    const dto = { menuItemId: 5, quantity: 2 } as any;
    const menuItem = { id: 5, name: 'Latte', price: D(250), isAvailable: true, trackStock: false, station: 'bar', modifiers: [{ id: 8 }] };

    it('refuses billed orders', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'billed' });
      await expect(service.addItem(CAFE_ID, 1, dto)).rejects.toThrow(BadRequestException);
    });

    it('refuses sold-out items', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'pending' });
      prisma.menuItem.findFirst.mockResolvedValue({ ...menuItem, isAvailable: false });
      await expect(service.addItem(CAFE_ID, 1, dto)).rejects.toThrow(/sold out/);
    });

    it("refuses a modifier that belongs to another item", async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'pending' });
      prisma.menuItem.findFirst.mockResolvedValue(menuItem);
      await expect(service.addItem(CAFE_ID, 1, { ...dto, modifierIds: [999] })).rejects.toThrow(BadRequestException);
    });

    it('snapshots price + station and reopens a served order to pending', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'served' });
      prisma.menuItem.findFirst.mockResolvedValue(menuItem);
      prisma.orderItem.create.mockResolvedValue({ id: 99 });
      await service.addItem(CAFE_ID, 1, { ...dto, modifierIds: [8], note: ' less sugar ' });
      expect(prisma.orderItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ price: menuItem.price, station: 'bar', note: 'less sugar' }),
      });
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'pending' } });
    });
  });

  describe('sendToKitchen', () => {
    it('only sends unsent, non-voided items', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1, status: 'preparing',
        orderItems: [
          { id: 1, status: 'pending', sentToKitchen: true, voidedAt: null },
          { id: 2, status: 'pending', sentToKitchen: false, voidedAt: null },
          { id: 3, status: 'pending', sentToKitchen: false, voidedAt: new Date() },
        ],
      });
      prisma.order.update.mockResolvedValue({ id: 1 });
      await service.sendToKitchen(CAFE_ID, 1);
      expect(prisma.orderItem.updateMany).toHaveBeenCalledWith({ where: { id: { in: [2] } }, data: { sentToKitchen: true, sentAt: expect.any(Date) } });
      expect(gateway.emitOrderSentToKitchen).toHaveBeenCalledWith(CAFE_ID, expect.objectContaining({ orderId: 1 }));
    });

    it('throws when nothing is new', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'preparing', orderItems: [{ id: 1, status: 'pending', sentToKitchen: true, voidedAt: null }] });
      await expect(service.sendToKitchen(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('serve', () => {
    it('ignores voided items when checking the kitchen is done', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1, status: 'preparing',
        orderItems: [{ status: 'ready', voidedAt: null }, { status: 'pending', voidedAt: new Date() }],
      });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'served' });
      await expect(service.serve(CAFE_ID, 1)).resolves.toEqual({ id: 1, status: 'served' });
    });
  });

  describe('cancel', () => {
    it('lets anyone cancel a pending order', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'pending', tableId: 4, orderItems: [], payments: [] });
      prisma.order.update.mockResolvedValue({ id: 1, status: 'cancelled' });
      await service.cancel(CAFE_ID, 1, WAITER);
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { status: 'free' } });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('requires an admin once the kitchen has started', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'preparing', tableId: 4, orderItems: [], payments: [] });
      await expect(service.cancel(CAFE_ID, 1, WAITER, 'oops')).rejects.toThrow(ForbiddenException);
    });

    it('requires a reason and writes the audit log', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'preparing', tableId: 4, orderItems: [], payments: [] });
      await expect(service.cancel(CAFE_ID, 1, ADMIN)).rejects.toThrow(BadRequestException);
      prisma.order.update.mockResolvedValue({ id: 1 });
      await service.cancel(CAFE_ID, 1, ADMIN, 'Walked out');
      expect(audit.log).toHaveBeenCalledWith(CAFE_ID, ADMIN, 'order.cancel', 'order', 1, expect.anything(), prisma);
    });
  });

  describe('generateBill', () => {
    it('freezes totals and takes the next bill number', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1, status: 'served', billNumber: null, discountType: null, discountValue: null, payments: [],
        orderItems: [line(150, 2)], cafe: cafeBilling(),
      });
      await service.generateBill(CAFE_ID, 1);
      expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: 1, cafeId: CAFE_ID, status: 'served' }, data: { status: 'billed' } });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'billed', billNumber: 7, total: D(300) }),
      });
    });
  });

  describe('generateBill race', () => {
    it('refuses when another request already billed it (no bill number taken)', async () => {
      prisma.order.findFirst.mockResolvedValue({
        id: 1, status: 'served', billNumber: null, discountType: null, discountValue: null, payments: [],
        orderItems: [line(150, 2)], cafe: cafeBilling(),
      });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.generateBill(CAFE_ID, 1)).rejects.toThrow(BadRequestException);
      expect(prisma.cafe.update).not.toHaveBeenCalled();
    });
  });

  describe('addPayment', () => {
    const billed = (paid: number[] = []) => ({
      id: 1, status: 'billed', total: D(1000), tableId: 4,
      payments: paid.map((a) => ({ amount: D(a) })), orderItems: [{ menuItemId: 5, quantity: 1, voidedAt: null }],
      cafe: { inventoryEnabled: true, plan: 'standard', subscriptionStatus: 'active' },
    });
    const pay = (paid: number[] = []) => {
      prisma.order.findFirst.mockResolvedValue(billed(paid));
      prisma.order.findUniqueOrThrow.mockResolvedValue(billed(paid));
    };

    it('takes a partial payment without closing the order', async () => {
      pay();
      const r = await service.addPayment(CAFE_ID, 1, { method: 'cash', amount: 400 } as any, CASHIER);
      expect(r.fullyPaid).toBe(false);
      expect(r.remaining).toBe('600.00');
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('closes the order, frees the table and does not touch menu stock again', async () => {
      pay([400]);
      const r = await service.addPayment(CAFE_ID, 1, { method: 'fonepay_qr', amount: 600 } as any, CASHIER);
      expect(r.fullyPaid).toBe(true);
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'paid' } });
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { status: 'free' } });
      expect(prisma.menuItem.update).not.toHaveBeenCalled();
    });

    it('re-checks inside the transaction (a payment that landed meanwhile counts)', async () => {
      prisma.order.findFirst.mockResolvedValue(billed());
      prisma.order.findUniqueOrThrow.mockResolvedValue(billed([1000]));
      await expect(service.addPayment(CAFE_ID, 1, { method: 'cash', amount: 1000 } as any, CASHIER)).rejects.toThrow(BadRequestException);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('rejects paying more than what is left', async () => {
      pay([900]);
      await expect(service.addPayment(CAFE_ID, 1, { method: 'cash', amount: 200 } as any, CASHIER)).rejects.toThrow(BadRequestException);
    });

    it('deducts recipe ingredients once fully paid', async () => {
      pay();
      prisma.recipeLine.findMany.mockResolvedValue([{ menuItemId: 5, stockItemId: 9, quantity: D(18), stockItem: { avgCost: D(2) } }]);
      await service.addPayment(CAFE_ID, 1, { method: 'cash', amount: 1000 } as any, CASHIER);
      expect(prisma.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stockItemId: 9, type: 'sale' }) });
      expect(prisma.stockItem.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { currentQty: { decrement: D(18) } } });
    });
  });

  describe('voidItem', () => {
    it('refuses while the bill is printed', async () => {
      prisma.orderItem.findFirst.mockResolvedValue({ id: 3, voidedAt: null, order: { status: 'billed' }, menuItem: { trackStock: false } });
      await expect(service.voidItem(CAFE_ID, 3, 'x', WAITER)).rejects.toThrow(BadRequestException);
    });

    it('keeps the row, records who/why and notifies the kitchen', async () => {
      prisma.orderItem.findFirst.mockResolvedValue({
        id: 3, orderId: 1, quantity: 1, price: D(200), menuItemId: 5, voidedAt: null,
        order: { id: 1, status: 'preparing' }, menuItem: { name: 'Momo', trackStock: false },
      });
      prisma.orderItem.update.mockResolvedValue({ id: 3 });
      prisma.orderItem.count.mockResolvedValue(1);
      await service.voidItem(CAFE_ID, 3, 'Changed mind', WAITER);
      expect(prisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: expect.objectContaining({ voidReason: 'Changed mind', voidedById: 2 }),
      });
      expect(prisma.orderItem.delete).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalled();
      expect(gateway.emitCafe).toHaveBeenCalledWith(CAFE_ID, 'order.itemVoided', { orderId: 1, orderItemId: 3 });
    });
  });

  describe('reopenToServed', () => {
    it('refuses once money has been taken', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'billed', payments: [{ id: 1 }] });
      await expect(service.reopenToServed(CAFE_ID, 1, CASHIER)).rejects.toThrow(BadRequestException);
    });
  });

  describe('applyDiscount', () => {
    it('stops a cashier giving more than 20%', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 1, status: 'served', payments: [], orderItems: [], cafe: cafeBilling() });
      await expect(
        service.applyDiscount(CAFE_ID, 1, { type: 'percent', value: 50, reason: 'friend' } as any, CASHIER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listBills', () => {
    const row = (id: number) => ({
      id, billNumber: id + 100, status: 'paid', source: 'staff', orderType: 'dine_in',
      total: D(500), discountAmount: null, printCount: 1, createdAt: new Date(),
      table: { tableNumber: '4' }, waiter: { name: 'Sita' },
      payments: [{ method: 'cash', amount: D(500), paidAt: new Date() }],
    });

    it('only lists billed orders of this cafe, and matches a number as bill no., order no. or table', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      await service.listBills(CAFE_ID, { q: '#42' });
      const where = prisma.order.findMany.mock.calls[0][0].where;
      expect(where.cafeId).toBe(CAFE_ID);
      expect(where.billNumber).toEqual({ not: null });
      expect(where.OR).toEqual([
        { billNumber: 42 },
        { id: 42 },
        { table: { tableNumber: { equals: '42', mode: 'insensitive' } } },
      ]);
    });

    it('returns a cursor only when there is another page', async () => {
      prisma.order.findMany.mockResolvedValue([row(9), row(8), row(7)]);
      const res = await service.listBills(CAFE_ID, { take: 2 });
      expect(res.bills.map((b) => b.id)).toEqual([9, 8]);
      expect(res.nextBefore).toBe(8);
      expect(res.bills[0]).toMatchObject({ billNumber: 109, paid: '500.00', methods: ['cash'], table: '4' });

      prisma.order.findMany.mockResolvedValue([row(3)]);
      expect((await service.listBills(CAFE_ID, { take: 2 })).nextBefore).toBeNull();
    });
  });
});
