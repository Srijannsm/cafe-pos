import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
let admin: string, cashier: string, waiter: string;
beforeAll(async () => {
  h = await bootstrap();
  const { A } = h.world;
  [admin, cashier, waiter] = await Promise.all([h.login('cafe-a', A.admin.id), h.login('cafe-a', A.cashier.id), h.login('cafe-a', A.waiter.id)]);
});
afterAll(async () => { await h?.close(); });

async function payOrder(items: { menuItemId: number; quantity: number }[]) {
  const { A } = h.world;
  const t = await h.prisma.restaurantTable.create({ data: { cafeId: A.cafe.id, tableNumber: `I${Math.random().toString(36).slice(2, 6)}`, capacity: 2 } });
  const o = await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' });
  for (const it of items) await h.as(waiter).post(`/orders/${o.body.id}/items`, it);
  await h.as(waiter).patch(`/orders/${o.body.id}/send-to-kitchen`);
  for (const i of (await h.as(waiter).get(`/orders/${o.body.id}`)).body.orderItems) await h.as(waiter).patch(`/orders/items/${i.id}/ready`);
  await h.as(waiter).patch(`/orders/${o.body.id}/serve`);
  const bill = await h.as(cashier).patch(`/orders/${o.body.id}/bill`);
  const pay = await h.as(cashier).post(`/orders/${o.body.id}/payments`, { method: 'cash', amount: Number(bill.body.total) });
  expect(pay.status).toBe(201);
  return o.body.id as number;
}

describe('inventory', () => {
  let milk: { id: number };
  it('creates a stock item with an opening balance', async () => {
    const res = await h.as(admin).post('/inventory/items', { name: 'Milk', kind: 'ingredient', unit: 'ml', openingQty: 10000, unitCost: 0.1, lowStockThreshold: 2000 });
    expect(res.status).toBe(201);
    milk = res.body;
    const items = await h.as(admin).get('/inventory/items');
    expect(Number(items.body.find((i: { id: number }) => i.id === milk.id).currentQty)).toBe(10000);
  });

  it('a purchase adds stock and updates weighted average cost', async () => {
    const res = await h.as(cashier).post('/inventory/purchases', { supplierName: 'Dairy Co', lines: [{ stockItemId: milk.id, quantity: 10000, lineTotal: 1500 }] });
    expect(res.status).toBe(201);
    const item = await h.prisma.stockItem.findUniqueOrThrow({ where: { id: milk.id } });
    expect(Number(item.currentQty)).toBe(20000);
    expect(Number(item.avgCost)).toBeCloseTo(0.125, 4); // (1000 + 1500) / 20000
  });

  it('paying for a drink with a recipe deducts ingredients once', async () => {
    const { A } = h.world;
    expect((await h.as(admin).patch(`/menu/${A.latte.id}/recipe`, { lines: [{ stockItemId: milk.id, quantity: 150 }] })).status).toBe(200);
    await payOrder([{ menuItemId: A.latte.id, quantity: 2 }]);
    const item = await h.prisma.stockItem.findUniqueOrThrow({ where: { id: milk.id } });
    expect(Number(item.currentQty)).toBe(19700);
    const ledger = await h.prisma.stockMovement.aggregate({ where: { stockItemId: milk.id }, _sum: { quantity: true } });
    expect(Number(ledger._sum.quantity)).toBe(19700); // cached qty == ledger
  });

  it('stock-out and a count post movements; count records the variance', async () => {
    expect((await h.as(cashier).post('/inventory/stock-out', { stockItemId: milk.id, type: 'wastage', quantity: 700, reason: 'spoiled' })).status).toBe(201);
    expect((await h.as(admin).post('/inventory/counts', { lines: [{ stockItemId: milk.id, countedQty: 18500 }] })).status).toBe(201);
    const item = await h.prisma.stockItem.findUniqueOrThrow({ where: { id: milk.id } });
    expect(Number(item.currentQty)).toBe(18500);
    const ledger = await h.prisma.stockMovement.aggregate({ where: { stockItemId: milk.id }, _sum: { quantity: true } });
    expect(Number(ledger._sum.quantity)).toBe(18500);
  });

  it("cannot use another cafe's stock item in a recipe or purchase", async () => {
    const { B, A } = h.world;
    const bItem = await h.prisma.stockItem.create({ data: { cafeId: B.cafe.id, name: 'B milk', unit: 'ml' } });
    expect([400, 404]).toContain((await h.as(admin).patch(`/menu/${A.momo.id}/recipe`, { lines: [{ stockItemId: bItem.id, quantity: 1 }] })).status);
    expect([400, 404]).toContain((await h.as(admin).post('/inventory/purchases', { lines: [{ stockItemId: bItem.id, quantity: 1, lineTotal: 1 }] })).status);
    expect(Number((await h.prisma.stockItem.findUniqueOrThrow({ where: { id: bItem.id } })).currentQty)).toBe(0);
  });

  it('starter plan cannot use inventory (403)', async () => {
    const bAdmin = await h.login('cafe-b', h.world.B.admin.id);
    expect((await h.as(bAdmin).get('/inventory/items')).status).toBe(403);
  });
});

describe('cash shifts', () => {
  it('expected cash = opening + cash sales + pay-ins - pay-outs/expenses; difference frozen on close', async () => {
    const { A } = h.world;
    expect((await h.as(cashier).post('/shifts/open', { openingCash: 2000 })).status).toBe(201);
    expect((await h.as(cashier).post('/shifts/open', { openingCash: 1 })).status).toBe(400);
    await payOrder([{ menuItemId: A.momo.id, quantity: 2 }]); // 360 cash
    expect((await h.as(cashier).post('/shifts/cash', { type: 'expense', amount: 160, category: 'milk' })).status).toBe(201);
    const close = await h.as(cashier).post('/shifts/close', { countedCash: 2150 });
    expect(close.status).toBe(201);
    expect(Number(close.body.expectedCash)).toBe(2200);
    const shift = await h.prisma.shift.findFirstOrThrow({ where: { cafeId: A.cafe.id }, orderBy: { id: 'desc' } });
    expect(Number(shift.difference)).toBe(-50);
  });

  it('two cashiers opening a shift at the same moment get one shift', async () => {
    const { A } = h.world;
    const results = await Promise.all([1, 2, 3].map(() => h.as(cashier).post('/shifts/open', { openingCash: 500 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await h.prisma.shift.count({ where: { cafeId: A.cafe.id, closedAt: null } })).toBe(1);
  });
});
