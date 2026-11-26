// Staff notifications are saved, so a screen that wasn't listening (asleep,
// on another page) still gets them from GET /notifications.
import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
let waiter: string;
let admin: string;
beforeAll(async () => {
  h = await bootstrap();
  waiter = await h.login('cafe-a', h.world.A.waiter.id);
  admin = await h.login('cafe-a', h.world.A.admin.id);
});
afterAll(async () => { await h?.close(); });

type N = { id: number; type: string; orderId: number | null; tableNumber: string | null; data: Record<string, unknown> };
const list = async (tok: string) => (await h.as(tok).get('/notifications')).body as N[];

describe('notifications', () => {
  let orderId: number;
  let itemId: number;

  it('sent / ready / recall are recorded with table, items, waiter and cook time', async () => {
    const t = await h.prisma.restaurantTable.create({ data: { cafeId: h.world.A.cafe.id, tableNumber: 'N1', capacity: 2 } });
    orderId = (await h.as(waiter).post('/orders', { tableId: t.id, waiterId: h.world.A.waiter.id, orderType: 'dine_in' })).body.id;
    itemId = (await h.as(waiter).post(`/orders/${orderId}/items`, { menuItemId: h.world.A.momo.id, quantity: 2 })).body.orderItems?.[0]?.id
      ?? (await h.prisma.orderItem.findFirstOrThrow({ where: { orderId } })).id;
    await h.as(waiter).patch(`/orders/${orderId}/send-to-kitchen`);
    await h.as(waiter).patch('/orders/items/ready', { ids: [itemId] });
    await h.as(waiter).patch(`/orders/items/${itemId}/recall`);

    const mine = (await list(admin)).filter((n) => n.orderId === orderId);
    expect(mine.map((n) => n.type)).toEqual(['recalled', 'ready', 'sent']); // newest first
    const ready = mine.find((n) => n.type === 'ready')!;
    expect(ready).toMatchObject({ tableNumber: 'N1', data: { items: ['2x Momo'] } });
    expect(typeof ready.data.cookSecs).toBe('number');
    expect(mine.find((n) => n.type === 'sent')!.data).toMatchObject({ count: 2, waiter: expect.any(String) });
  });

  it('single-item ready (PATCH /orders/items/:id/ready) is recorded too', async () => {
    await h.as(waiter).patch(`/orders/items/${itemId}/ready`);
    expect((await list(waiter))[0]).toMatchObject({ type: 'ready', orderId });
  });

  it('waiters do not get the admin-only kitchen traffic', async () => {
    const types = new Set((await list(waiter)).map((n) => n.type));
    expect(types.has('sent')).toBe(false);
    expect(types.has('ready')).toBe(true);
  });

  it('QR order and table requests are recorded', async () => {
    const t = await h.prisma.restaurantTable.findFirstOrThrow({ where: { cafeId: h.world.A.cafe.id, tableNumber: 'N1' } });
    await h.http().post(`/public/tables/${t.qrToken}/request`).send({ type: 'request_bill' });
    expect((await list(waiter))[0]).toMatchObject({ type: 'request_bill', tableNumber: 'N1', orderId });
  });

  it('another cafe sees none of it', async () => {
    const b = await h.login('cafe-b', h.world.B.waiter.id);
    expect((await list(b)).some((n) => n.orderId === orderId)).toBe(false);
  });

  it('requires login', async () => {
    expect((await h.http().get('/notifications')).status).toBe(401);
  });
});
