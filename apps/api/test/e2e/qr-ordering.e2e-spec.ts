import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
let waiter: string, admin: string;
beforeAll(async () => {
  h = await bootstrap();
  waiter = await h.login('cafe-a', h.world.A.waiter.id);
  admin = await h.login('cafe-a', h.world.A.admin.id);
});
afterAll(async () => { await h?.close(); });

describe('customer QR ordering', () => {
  it('shows the menu for a valid table token without auth', async () => {
    const res = await h.http().get(`/public/tables/${h.world.A.t1.qrToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('Latte');
    expect(JSON.stringify(res.body)).not.toContain('pinHash');
    expect(JSON.stringify(res.body)).not.toContain('costPrice');
  });

  it('404s for an unknown token', async () => {
    expect((await h.http().get('/public/tables/not-a-real-token')).status).toBe(404);
  });

  it('places an order as pending/qr that the kitchen only sees after staff confirm', async () => {
    const { A } = h.world;
    const res = await h.http().post(`/public/tables/${A.t1.qrToken}/order`).send({ items: [{ menuItemId: A.latte.id, quantity: 2, modifierIds: [A.extraShot.id] }] });
    expect(res.status).toBe(201);
    const order = await h.prisma.order.findFirstOrThrow({ where: { tableId: A.t1.id, status: { notIn: ['paid', 'cancelled'] } }, include: { orderItems: true } });
    expect(order.source).toBe('qr');
    expect(order.status).toBe('pending');
    expect(order.orderItems.every((i) => !i.sentToKitchen)).toBe(true);
    // price is the server's, not anything the client could send
    expect(Number(order.orderItems[0].price)).toBe(250);
    // scanning again joins the same order
    await h.http().post(`/public/tables/${A.t1.qrToken}/order`).send({ items: [{ menuItemId: A.momo.id, quantity: 1 }] });
    expect(await h.prisma.order.count({ where: { tableId: A.t1.id, status: { notIn: ['paid', 'cancelled'] } } })).toBe(1);
    expect((await h.as(waiter).patch(`/orders/${order.id}/send-to-kitchen`)).status).toBe(200);
  });

  it("refuses another cafe's menu item and junk quantities", async () => {
    const { A, B } = h.world;
    const foreign = await h.http().post(`/public/tables/${A.t2.qrToken}/order`).send({ items: [{ menuItemId: B.latte.id, quantity: 1 }] });
    expect([400, 404]).toContain(foreign.status);
    const tooMany = await h.http().post(`/public/tables/${A.t2.qrToken}/order`).send({ items: [{ menuItemId: A.latte.id, quantity: 500 }] });
    expect(tooMany.status).toBe(400);
    const empty = await h.http().post(`/public/tables/${A.t2.qrToken}/order`).send({ items: [] });
    expect(empty.status).toBe(400);
  });

  it('a call-waiter request is rate limited and shows up for staff', async () => {
    const { A } = h.world;
    expect((await h.http().post(`/public/tables/${A.t2.qrToken}/request`).send({ type: 'call_waiter' })).status).toBe(201);
    expect((await h.http().post(`/public/tables/${A.t2.qrToken}/request`).send({ type: 'call_waiter' })).status).toBe(429);
    const list = await h.as(waiter).get('/tables/requests');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
  });

  it('regenerating the QR kills the old link', async () => {
    const { A } = h.world;
    const old = A.t2.qrToken;
    expect((await h.as(admin).patch(`/tables/${A.t2.id}/regenerate-qr`)).status).toBe(200);
    expect((await h.http().get(`/public/tables/${old}`)).status).toBe(404);
  });

  it('starter plan (no QR feature) cannot take QR orders', async () => {
    const { B } = h.world;
    expect((await h.http().get(`/public/tables/${B.t1.qrToken}`)).status).toBe(403);
    expect((await h.http().post(`/public/tables/${B.t1.qrToken}/order`).send({ items: [{ menuItemId: B.latte.id, quantity: 1 }] })).status).toBe(403);
  });
});
