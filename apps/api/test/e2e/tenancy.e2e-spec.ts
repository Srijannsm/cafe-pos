// Cafe A's staff must never read or change cafe B's data, whatever ids they send.
import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
let a: string; // cafe A admin token
let bOrderId: number;
beforeAll(async () => {
  h = await bootstrap();
  a = await h.login('cafe-a', h.world.A.admin.id);
  const { B } = h.world;
  const o = await h.prisma.order.create({ data: { cafeId: B.cafe.id, tableId: B.t1.id, waiterId: B.waiter.id, orderType: 'dine_in' } });
  bOrderId = o.id;
  await h.prisma.orderItem.create({ data: { orderId: o.id, menuItemId: B.latte.id, quantity: 1, price: 250 } });
});
afterAll(async () => { await h?.close(); });

describe("cafe A cannot touch cafe B's records", () => {
  it('lists only its own orders, tables, menu, staff', async () => {
    const { A, B } = h.world;
    const orders = await h.as(a).get('/orders');
    expect(orders.status).toBe(200);
    expect(orders.body.every((o: { cafeId: number }) => o.cafeId === A.cafe.id)).toBe(true);
    const tables = await h.as(a).get('/tables');
    expect(JSON.stringify(tables.body)).not.toContain(B.t1.qrToken);
    const users = await h.as(a).get('/users');
    expect(users.body.map((u: { id: number }) => u.id)).not.toContain(B.admin.id);
    const menu = await h.as(a).get('/menu/all');
    expect(JSON.stringify(menu.body)).not.toContain(`"id":${B.latte.id},`);
  });

  it('404s on reading or mutating B\'s order', async () => {
    expect((await h.as(a).get(`/orders/${bOrderId}`)).status).toBe(404);
    expect((await h.as(a).patch(`/orders/${bOrderId}/send-to-kitchen`)).status).toBe(404);
    expect((await h.as(a).patch(`/orders/${bOrderId}/cancel`, { reason: 'x' })).status).toBe(404);
    expect((await h.as(a).patch(`/orders/${bOrderId}/bill`)).status).toBe(404);
    expect((await h.as(a).post(`/orders/${bOrderId}/payments`, { method: 'cash', amount: 1 })).status).toBe(404);
    expect((await h.as(a).post(`/orders/${bOrderId}/items`, { menuItemId: h.world.A.latte.id, quantity: 1 })).status).toBe(404);
  });

  it("can't create an order on B's table or add B's menu item / modifier to an A order", async () => {
    const { A, B } = h.world;
    expect((await h.as(a).post('/orders', { tableId: B.t1.id, waiterId: A.waiter.id, orderType: 'dine_in' })).status).toBe(404);
    expect((await h.as(a).post('/orders', { tableId: A.t1.id, waiterId: B.waiter.id, orderType: 'dine_in' })).status).toBe(404);
    const mine = await h.as(a).post('/orders', { tableId: A.t2.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    expect(mine.status).toBe(201);
    expect((await h.as(a).post(`/orders/${mine.body.id}/items`, { menuItemId: B.latte.id, quantity: 1 })).status).toBe(404);
    const withForeignMod = await h.as(a).post(`/orders/${mine.body.id}/items`, { menuItemId: A.latte.id, quantity: 1, modifierIds: [B.extraShot.id] });
    expect([400, 404]).toContain(withForeignMod.status);
  });

  it("can't edit B's menu item, category, modifier, table, or user", async () => {
    const { B } = h.world;
    expect((await h.as(a).patch(`/menu/${B.latte.id}`, { price: 1 })).status).toBe(404);
    expect((await h.as(a).patch(`/menu/${B.latte.id}/availability`, { isAvailable: false })).status).toBe(404);
    expect((await h.as(a).delete(`/menu/${B.latte.id}`)).status).toBe(404);
    expect((await h.as(a).patch(`/menu/categories/${B.cat.id}`, { name: 'hacked' })).status).toBe(404);
    expect((await h.as(a).patch(`/menu/modifiers/${B.extraShot.id}`, { name: 'hacked' })).status).toBe(404);
    expect((await h.as(a).delete(`/menu/modifiers/${B.extraShot.id}`)).status).toBe(404);
    expect((await h.as(a).patch(`/tables/${B.t1.id}`, { capacity: 9 })).status).toBe(404);
    expect((await h.as(a).patch(`/tables/${B.t1.id}/regenerate-qr`)).status).toBe(404);
    expect((await h.as(a).patch(`/users/${B.waiter.id}`, { pin: '0000' })).status).toBe(404);
    // nothing in B actually changed
    const latte = await h.prisma.menuItem.findUniqueOrThrow({ where: { id: B.latte.id } });
    expect(Number(latte.price)).toBe(250);
    expect((await h.prisma.menuCategory.findUniqueOrThrow({ where: { id: B.cat.id } })).name).toBe('Drinks');
  });

  it("can't merge B's table into its own or move an order onto B's table", async () => {
    const { A, B } = h.world;
    const merge = await h.as(a).post(`/tables/${A.t1.id}/merge`, { secondaryTableId: B.t2.id });
    expect([400, 404]).toContain(merge.status);
    const o = await h.as(a).post('/orders', { tableId: A.t1.id, waiterId: A.waiter.id, orderType: 'dine_in' });
    const move = await h.as(a).patch(`/orders/${o.body.id}/move-to-table/${B.t2.id}`);
    expect([400, 404]).toContain(move.status);
    const merge2 = await h.as(a).patch(`/orders/${o.body.id}/merge-into/${bOrderId}`);
    expect([400, 404]).toContain(merge2.status);
  });

  it("can't create a category under B's parent category", async () => {
    const res = await h.as(a).post('/menu/categories', { name: 'Sneaky', parentId: h.world.B.cat.id });
    expect([400, 404]).toContain(res.status);
  });
});
