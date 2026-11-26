// "Customer left" -- cancelling an order the kitchen already has needs an admin.
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

let n = 0;
async function sentOrder() {
  const t = await h.prisma.restaurantTable.create({ data: { cafeId: h.world.A.cafe.id, tableNumber: `C${++n}`, capacity: 2 } });
  const id = (await h.as(waiter).post('/orders', { tableId: t.id, waiterId: h.world.A.waiter.id, orderType: 'dine_in' })).body.id as number;
  await h.as(waiter).post(`/orders/${id}/items`, { menuItemId: h.world.A.momo.id, quantity: 1 });
  await h.as(waiter).patch(`/orders/${id}/send-to-kitchen`);
  return { id, tableId: t.id };
}
const types = async (tok: string, orderId: number) =>
  ((await h.as(tok).get('/notifications')).body as { type: string; orderId: number }[]).filter((x) => x.orderId === orderId).map((x) => x.type);
const ticket = async (orderId: number) =>
  ((await h.as(waiter).get('/orders/kitchen')).body.cooking as { orderId: number; cancelRequest: { id: number; reason: string; requestedBy: string } | null }[]).find((t) => t.orderId === orderId);

describe('cancel requests', () => {
  it('waiter asks -> pending, shown on the ticket, admins notified', async () => {
    const o = await sentOrder();
    const r = await h.as(waiter).post('/cancel-requests', { orderId: o.id, reason: 'Customer left' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('pending');
    expect((await ticket(o.id))!.cancelRequest).toMatchObject({ id: r.body.id, reason: 'Customer left' });
    expect(await types(admin, o.id)).toContain('cancel_request');
    expect(await types(waiter, o.id)).not.toContain('cancel_request'); // admins only

    // a second request for the same order is refused
    expect((await h.as(waiter).post('/cancel-requests', { orderId: o.id, reason: 'again' })).status).toBe(409);
    // a waiter cannot approve
    expect((await h.as(waiter).post(`/cancel-requests/${r.body.id}/approve`)).status).toBe(403);

    // admin approves -> order cancelled, table freed, everyone told
    expect((await h.as(admin).post(`/cancel-requests/${r.body.id}/approve`)).status).toBe(201);
    const order = await h.prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { table: true } });
    expect(order.status).toBe('cancelled');
    expect(order.cancelReason).toContain('Customer left');
    expect(order.table.status).toBe('free');
    expect(await ticket(o.id)).toBeUndefined();
    expect(await types(waiter, o.id)).toContain('cancel_approved');
    // deciding twice is refused
    expect((await h.as(admin).post(`/cancel-requests/${r.body.id}/reject`)).status).toBe(409);
  });

  it('admin declines -> order carries on', async () => {
    const o = await sentOrder();
    const r = await h.as(waiter).post('/cancel-requests', { orderId: o.id, reason: 'Waited too long' });
    expect((await h.as(admin).post(`/cancel-requests/${r.body.id}/reject`)).status).toBe(201);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('preparing');
    expect((await ticket(o.id))!.cancelRequest).toBeNull();
    expect(await types(waiter, o.id)).toContain('cancel_rejected');
  });

  it('an admin asking cancels straight away', async () => {
    const o = await sentOrder();
    const r = await h.as(admin).post('/cancel-requests', { orderId: o.id, reason: 'Customer left' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('approved');
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('cancelled');
  });

  it('not-yet-sent orders use the normal cancel; reason required', async () => {
    const t = await h.prisma.restaurantTable.create({ data: { cafeId: h.world.A.cafe.id, tableNumber: 'C-pend', capacity: 2 } });
    const id = (await h.as(waiter).post('/orders', { tableId: t.id, waiterId: h.world.A.waiter.id, orderType: 'dine_in' })).body.id;
    expect((await h.as(waiter).post('/cancel-requests', { orderId: id, reason: 'x y' })).status).toBe(400);
    const o = await sentOrder();
    expect((await h.as(waiter).post('/cancel-requests', { orderId: o.id, reason: '' })).status).toBe(400);
  });

  it('another cafe can neither ask nor decide', async () => {
    const o = await sentOrder();
    const r = await h.as(waiter).post('/cancel-requests', { orderId: o.id, reason: 'Customer left' });
    const bAdmin = await h.login('cafe-b', h.world.B.admin.id);
    expect((await h.as(bAdmin).post(`/cancel-requests/${r.body.id}/approve`)).status).toBe(404);
    expect((await h.as(bAdmin).post('/cancel-requests', { orderId: o.id, reason: 'Customer left' })).status).toBe(404);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('preparing');
  });
});
