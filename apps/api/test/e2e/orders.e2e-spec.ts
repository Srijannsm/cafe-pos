// The money path, end to end: order -> kitchen -> serve -> bill -> discount -> pay.
import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
let admin: string, cashier: string, waiter: string;
beforeAll(async () => {
  h = await bootstrap();
  const { A } = h.world;
  [admin, cashier, waiter] = await Promise.all([h.login('cafe-a', A.admin.id), h.login('cafe-a', A.cashier.id), h.login('cafe-a', A.waiter.id)]);
});
afterAll(async () => { await h?.close(); });

/** Creates an order on a free table and takes it all the way to "served". */
async function servedOrder(tableId: number, items: { menuItemId: number; quantity: number; modifierIds?: number[] }[]) {
  const o = await h.as(waiter).post('/orders', { tableId, waiterId: h.world.A.waiter.id, orderType: 'dine_in' });
  expect(o.status).toBe(201);
  for (const it of items) expect((await h.as(waiter).post(`/orders/${o.body.id}/items`, it)).status).toBe(201);
  expect((await h.as(waiter).patch(`/orders/${o.body.id}/send-to-kitchen`)).status).toBe(200);
  const full = await h.as(waiter).get(`/orders/${o.body.id}`);
  for (const i of full.body.orderItems) expect((await h.as(waiter).patch(`/orders/items/${i.id}/ready`)).status).toBe(200);
  expect((await h.as(waiter).patch(`/orders/${o.body.id}/serve`)).status).toBe(200);
  return o.body.id as number;
}
async function freeTable(n: string) {
  return h.prisma.restaurantTable.create({ data: { cafeId: h.world.A.cafe.id, tableNumber: n, capacity: 2 } });
}

describe('happy path', () => {
  it('order with a modifier -> bill -> split payment -> paid, table freed', async () => {
    const { A } = h.world;
    const id = await servedOrder(A.t1.id, [
      { menuItemId: A.latte.id, quantity: 2, modifierIds: [A.extraShot.id] }, // 2 x (250+50) = 600
      { menuItemId: A.momo.id, quantity: 1 }, // 180
    ]);
    const table = await h.prisma.restaurantTable.findUniqueOrThrow({ where: { id: A.t1.id } });
    expect(table.status).toBe('occupied');

    const bill = await h.as(cashier).patch(`/orders/${id}/bill`);
    expect(bill.status).toBe(200);
    expect(bill.body.billNumber).toEqual(expect.any(Number));
    expect(Number(bill.body.total)).toBe(780);

    const p1 = await h.as(cashier).post(`/orders/${id}/payments`, { method: 'cash', amount: 500 });
    expect(p1.status).toBe(201);
    expect(p1.body).toMatchObject({ fullyPaid: false, remaining: '280.00' });
    const over = await h.as(cashier).post(`/orders/${id}/payments`, { method: 'fonepay_qr', amount: 281 });
    expect(over.status).toBe(400);
    const p2 = await h.as(cashier).post(`/orders/${id}/payments`, { method: 'fonepay_qr', amount: 280, reference: 'FP1' });
    expect(p2.body).toMatchObject({ fullyPaid: true });

    const after = await h.as(cashier).get(`/orders/${id}`);
    expect(after.body.status).toBe('paid');
    expect(after.body.payments).toHaveLength(2);
    expect((await h.prisma.restaurantTable.findUniqueOrThrow({ where: { id: A.t1.id } })).status).toBe('free');
    // paying again is refused
    expect((await h.as(cashier).post(`/orders/${id}/payments`, { method: 'cash', amount: 1 })).status).toBe(400);
  });

  it('bill numbers are sequential per cafe and a reopened bill keeps its number', async () => {
    const { A } = h.world;
    const t = await freeTable('10');
    const id1 = await servedOrder(t.id, [{ menuItemId: A.momo.id, quantity: 1 }]);
    const b1 = (await h.as(cashier).patch(`/orders/${id1}/bill`)).body.billNumber;
    expect((await h.as(cashier).patch(`/orders/${id1}/reopen`, { reason: 'add a drink' })).status).toBe(200);
    expect((await h.as(cashier).patch(`/orders/${id1}/bill`)).body.billNumber).toBe(b1);
    const t2 = await freeTable('11');
    const id2 = await servedOrder(t2.id, [{ menuItemId: A.momo.id, quantity: 1 }]);
    expect((await h.as(cashier).patch(`/orders/${id2}/bill`)).body.billNumber).toBe(b1 + 1);
  });

  it('VAT on top: 13% added after discount; inclusive prices back-calculate VAT', async () => {
    const { A } = h.world;
    await h.prisma.cafe.update({ where: { id: A.cafe.id }, data: { vatEnabled: true, vatRate: 13, pricesIncludeVat: false } });
    const t = await freeTable('12');
    const id = await servedOrder(t.id, [{ menuItemId: A.latte.id, quantity: 4 }]); // 1000
    expect((await h.as(cashier).patch(`/orders/${id}/discount`, { type: 'percent', value: 10, reason: 'regular' })).status).toBe(200);
    const bill = (await h.as(cashier).patch(`/orders/${id}/bill`)).body;
    expect(Number(bill.subtotal)).toBe(1000);
    expect(Number(bill.discountAmount)).toBe(100);
    expect(Number(bill.vatAmount)).toBeCloseTo(117, 2);
    expect(Number(bill.total)).toBeCloseTo(1017, 2);

    await h.prisma.cafe.update({ where: { id: A.cafe.id }, data: { pricesIncludeVat: true } });
    const t2 = await freeTable('13');
    const id2 = await servedOrder(t2.id, [{ menuItemId: A.latte.id, quantity: 4 }]); // 1000 incl.
    const bill2 = (await h.as(cashier).patch(`/orders/${id2}/bill`)).body;
    expect(Number(bill2.total)).toBeCloseTo(1000, 2);
    expect(Number(bill2.vatAmount)).toBeCloseTo(115.04, 2);
    await h.prisma.cafe.update({ where: { id: A.cafe.id }, data: { vatEnabled: false, pricesIncludeVat: false } });
  });
});

describe('guard rails', () => {
  it('cannot bill an order that is not served, or pay one not billed', async () => {
    const { A } = h.world;
    const t = await freeTable('20');
    const o = await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: A.momo.id, quantity: 1 });
    expect((await h.as(cashier).patch(`/orders/${o.body.id}/bill`)).status).toBe(400);
    expect((await h.as(cashier).post(`/orders/${o.body.id}/payments`, { method: 'cash', amount: 180 })).status).toBe(400);
  });

  it('refuses a second order on an occupied table', async () => {
    const { A } = h.world;
    const t = await freeTable('21');
    expect((await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' })).status).toBe(201);
    expect((await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' })).status).toBe(400);
  });

  it('rejects junk input: quantity 0, negative payment, unknown method, huge discount by cashier', async () => {
    const { A } = h.world;
    const t = await freeTable('22');
    const o = await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    expect((await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: A.momo.id, quantity: 0 })).status).toBe(400);
    expect((await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: A.momo.id, quantity: '2' })).status).toBe(400);
    expect((await h.as(cashier).post(`/orders/${o.body.id}/payments`, { method: 'cash', amount: -5 })).status).toBe(400);
    expect((await h.as(cashier).post(`/orders/${o.body.id}/payments`, { method: 'bitcoin', amount: 5 })).status).toBe(400);
    expect((await h.as(cashier).patch(`/orders/${o.body.id}/discount`, { type: 'percent', value: 50, reason: 'x' })).status).toBe(403);
    expect((await h.as(admin).patch(`/orders/${o.body.id}/discount`, { type: 'percent', value: 150, reason: 'x' })).status).toBe(400);
  });

  it('an unavailable (sold out) item cannot be added', async () => {
    const { A } = h.world;
    const item = await h.prisma.menuItem.create({ data: { cafeId: A.cafe.id, categoryId: A.cat.id, name: 'Gone', price: 99, isAvailable: false } });
    const t = await freeTable('23');
    const o = await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    expect((await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: item.id, quantity: 1 })).status).toBe(400);
  });

  it('tracked stock: refuses overselling and restores stock on cancel', async () => {
    const { A } = h.world;
    const cake = await h.prisma.menuItem.create({ data: { cafeId: A.cafe.id, categoryId: A.cat.id, name: 'Cake', price: 300, trackStock: true, stockQuantity: 2 } });
    const t = await freeTable('24');
    const o = await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    expect((await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: cake.id, quantity: 3 })).status).toBe(400);
    expect((await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: cake.id, quantity: 2 })).status).toBe(201);
    expect((await h.prisma.menuItem.findUniqueOrThrow({ where: { id: cake.id } })).stockQuantity).toBe(0);
    expect((await h.as(waiter).patch(`/orders/${o.body.id}/cancel`, {})).status).toBe(200);
    expect((await h.prisma.menuItem.findUniqueOrThrow({ where: { id: cake.id } })).stockQuantity).toBe(2);
  });

  it('after the kitchen has it, a waiter cannot cancel; an admin can with a reason', async () => {
    const { A } = h.world;
    const t = await freeTable('25');
    const o = await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: A.momo.id, quantity: 1 });
    await h.as(waiter).patch(`/orders/${o.body.id}/send-to-kitchen`);
    expect((await h.as(waiter).patch(`/orders/${o.body.id}/cancel`, { reason: 'x' })).status).toBe(403);
    expect((await h.as(admin).patch(`/orders/${o.body.id}/cancel`, {})).status).toBe(400);
    expect((await h.as(admin).patch(`/orders/${o.body.id}/cancel`, { reason: 'customer left' })).status).toBe(200);
    expect((await h.prisma.restaurantTable.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('free');
    const audit = await h.prisma.auditLog.findFirst({ where: { cafeId: A.cafe.id, entityId: o.body.id, action: { contains: 'cancel' } } });
    expect(audit).not.toBeNull();
  });

  it('void after kitchen keeps the row and drops it from the bill', async () => {
    const { A } = h.world;
    const t = await freeTable('26');
    const o = await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: A.momo.id, quantity: 1 });
    await h.as(waiter).post(`/orders/${o.body.id}/items`, { menuItemId: A.latte.id, quantity: 1 });
    await h.as(waiter).patch(`/orders/${o.body.id}/send-to-kitchen`);
    const full = (await h.as(waiter).get(`/orders/${o.body.id}`)).body;
    const momoItem = full.orderItems.find((i: { menuItemId: number }) => i.menuItemId === A.momo.id);
    expect((await h.as(waiter).delete(`/orders/items/${momoItem.id}`)).status).toBe(400); // must void, not delete
    expect((await h.as(waiter).patch(`/orders/items/${momoItem.id}/void`, { reason: 'wrong order' })).status).toBe(200);
    for (const i of full.orderItems) if (i.id !== momoItem.id) await h.as(waiter).patch(`/orders/items/${i.id}/ready`);
    await h.as(waiter).patch(`/orders/${o.body.id}/serve`);
    const bill = (await h.as(cashier).patch(`/orders/${o.body.id}/bill`)).body;
    expect(Number(bill.total)).toBe(250);
  });
});

describe('concurrency', () => {
  it('two simultaneous full payments do not overpay the bill', async () => {
    const { A } = h.world;
    const t = await freeTable('30');
    const id = await servedOrder(t.id, [{ menuItemId: A.momo.id, quantity: 1 }]);
    await h.as(cashier).patch(`/orders/${id}/bill`);
    const results = await Promise.all([1, 2, 3].map(() => h.as(cashier).post(`/orders/${id}/payments`, { method: 'cash', amount: 180 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const payments = await h.prisma.payment.findMany({ where: { orderId: id } });
    expect(payments.reduce((s, p) => s + Number(p.amount), 0)).toBe(180);
  });

  it('two simultaneous "generate bill" taps give one bill number with no gap', async () => {
    const { A } = h.world;
    const before = (await h.prisma.cafe.findUniqueOrThrow({ where: { id: A.cafe.id } })).lastBillNumber;
    const t = await freeTable('31');
    const id = await servedOrder(t.id, [{ menuItemId: A.momo.id, quantity: 1 }]);
    const results = await Promise.all([1, 2, 3].map(() => h.as(cashier).patch(`/orders/${id}/bill`)));
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    const after = (await h.prisma.cafe.findUniqueOrThrow({ where: { id: A.cafe.id } })).lastBillNumber;
    expect(after).toBe(before + 1);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id } })).billNumber).toBe(before + 1);
  });

  it('two waiters opening the same free table at once get one order', async () => {
    const { A } = h.world;
    const t = await freeTable('32');
    const results = await Promise.all([1, 2].map(() => h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });
});

describe('Bills page API', () => {
  it('lists bills newest first, paginates with take/before, and searches by bill number', async () => {
    const page1 = await h.as(cashier).get('/orders/bills?take=2&status=all');
    expect(page1.status).toBe(200);
    expect(page1.body.bills).toHaveLength(2);
    expect(page1.body.nextBefore).toEqual(expect.any(Number));
    const page2 = await h.as(cashier).get(`/orders/bills?take=2&before=${page1.body.nextBefore}`);
    expect(page2.status).toBe(200);
    expect(page2.body.bills[0].id).toBeLessThan(page1.body.bills[1].id);
    const bn = page1.body.bills[0].billNumber;
    const found = await h.as(cashier).get(`/orders/bills?q=%23${bn}`);
    expect(found.body.bills.map((b: { billNumber: number }) => b.billNumber)).toContain(bn);
    expect((await h.as(waiter).get('/orders/bills')).status).toBe(403);
  });
});

describe('cart lines merge and quantity stepper', () => {
  async function openOrder() {
    const { A } = h.world;
    const t = await freeTable(`M${Math.random().toString(36).slice(2, 6)}`);
    const o = await h.as(waiter).post('/orders', { tableId: t.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    return o.body.id as number;
  }
  const lines = async (id: number) => (await h.as(waiter).get(`/orders/${id}`)).body.orderItems as { id: number; quantity: number; sentToKitchen: boolean }[];

  it('tapping the same item three times gives one 3x line', async () => {
    const { A } = h.world;
    const id = await openOrder();
    for (let i = 0; i < 3; i++) expect((await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 1 })).status).toBe(201);
    const l = await lines(id);
    expect(l).toHaveLength(1);
    expect(l[0].quantity).toBe(3);
  });

  it('different options or notes stay separate lines', async () => {
    const { A } = h.world;
    const id = await openOrder();
    await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.latte.id, quantity: 1 });
    await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.latte.id, quantity: 1, modifierIds: [A.extraShot.id] });
    await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.latte.id, quantity: 1, modifierIds: [A.extraShot.id] });
    await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.latte.id, quantity: 1, note: 'less sugar' });
    expect((await lines(id)).map((x) => x.quantity).sort()).toEqual([1, 1, 2]);
  });

  it('a new round after sending to the kitchen starts a new line', async () => {
    const { A } = h.world;
    const id = await openOrder();
    await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 2 });
    await h.as(waiter).patch(`/orders/${id}/send-to-kitchen`);
    await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 1 });
    const l = await lines(id);
    expect(l).toHaveLength(2);
    expect(l.find((x) => x.sentToKitchen)!.quantity).toBe(2);
    expect(l.find((x) => !x.sentToKitchen)!.quantity).toBe(1);
  });

  it('stepper: +1, -1, down to 0 removes the line; sent lines cannot change', async () => {
    const { A } = h.world;
    const id = await openOrder();
    const lineId = (await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 1 })).body.id;
    expect((await h.as(waiter).patch(`/orders/items/${lineId}/quantity`, { delta: 1 })).body).toMatchObject({ quantity: 2 });
    expect((await h.as(waiter).patch(`/orders/items/${lineId}/quantity`, { delta: -1 })).body).toMatchObject({ quantity: 1 });
    expect((await h.as(waiter).patch(`/orders/items/${lineId}/quantity`, { delta: -5 })).status).toBe(400);
    expect((await h.as(waiter).patch(`/orders/items/${lineId}/quantity`, { delta: 0 })).status).toBe(400);
    expect((await h.as(waiter).patch(`/orders/items/${lineId}/quantity`, { delta: -1 })).body).toMatchObject({ removed: true });
    expect(await lines(id)).toHaveLength(0);
    const again = (await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 1 })).body.id;
    await h.as(waiter).patch(`/orders/${id}/send-to-kitchen`);
    expect((await h.as(waiter).patch(`/orders/items/${again}/quantity`, { delta: 1 })).status).toBe(400);
  });

  it('undo after a merge takes back only what was just added', async () => {
    const { A } = h.world;
    const id = await openOrder();
    await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 2 });
    const second = await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 1 });
    expect(second.body.quantity).toBe(3);
    await h.as(waiter).patch(`/orders/items/${second.body.id}/quantity`, { delta: -1 });
    expect((await lines(id))[0].quantity).toBe(2);
  });

  it('tracked stock follows merges and the stepper', async () => {
    const { A } = h.world;
    const pie = await h.prisma.menuItem.create({ data: { cafeId: A.cafe.id, categoryId: A.cat.id, name: 'Pie', price: 200, trackStock: true, stockQuantity: 3 } });
    const id = await openOrder();
    const a = await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: pie.id, quantity: 1 });
    await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: pie.id, quantity: 1 });
    expect((await h.prisma.menuItem.findUniqueOrThrow({ where: { id: pie.id } })).stockQuantity).toBe(1);
    expect((await h.as(waiter).patch(`/orders/items/${a.body.id}/quantity`, { delta: 2 })).status).toBe(400);
    await h.as(waiter).patch(`/orders/items/${a.body.id}/quantity`, { delta: -2 });
    expect((await h.prisma.menuItem.findUniqueOrThrow({ where: { id: pie.id } })).stockQuantity).toBe(3);
  });

  it('four taps at the same moment still give one line', async () => {
    const { A } = h.world;
    const id = await openOrder();
    await Promise.all([1, 2, 3, 4].map(() => h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 1 })));
    const l = await lines(id);
    expect(l).toHaveLength(1);
    expect(l[0].quantity).toBe(4);
  });

  it("cafe B can't change cafe A's line", async () => {
    const { A, B } = h.world;
    const id = await openOrder();
    const add = await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: A.momo.id, quantity: 1 });
    const bWaiter = await h.login('cafe-b', B.waiter.id);
    expect((await h.as(bWaiter).patch(`/orders/items/${add.body.id}/quantity`, { delta: 5 })).status).toBe(404);
  });
});
