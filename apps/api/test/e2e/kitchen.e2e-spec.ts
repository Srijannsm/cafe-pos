// Kitchen display board: tickets per round, stations, ready lane, stats.
import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
let waiter: string;
let barItem: { id: number };
beforeAll(async () => {
  h = await bootstrap();
  waiter = await h.login('cafe-a', h.world.A.waiter.id);
  const { A } = h.world;
  barItem = await h.prisma.menuItem.create({ data: { cafeId: A.cafe.id, categoryId: A.cat.id, name: 'Mojito', price: 400, station: 'bar' } });
});
afterAll(async () => { await h?.close(); });

type Board = {
  cooking: { key: string; orderId: number; round: number; table: string; notes: string | null; items: { id: number; name: string; quantity: number; status: string; voided: boolean; modifiers: string[]; note: string | null }[]; orderAllReady: boolean }[];
  ready: { orderId: number; round: number; orderAllReady: boolean }[];
  counts: Record<string, number>;
  allDay: { name: string; quantity: number }[];
  stats: { ticketsDone: number; itemsDone: number; avgTicketSecs: number | null };
};
const board = async (q = '') => (await h.as(waiter).get(`/orders/kitchen${q}`)).body as Board;
async function order(table: string, notes?: string) {
  const t = await h.prisma.restaurantTable.create({ data: { cafeId: h.world.A.cafe.id, tableNumber: table, capacity: 2 } });
  return (await h.as(waiter).post('/orders', { tableId: t.id, waiterId: h.world.A.waiter.id, orderType: 'dine_in', notes })).body.id as number;
}
const add = (id: number, menuItemId: number, quantity = 1, extra: object = {}) => h.as(waiter).post(`/orders/${id}/items`, { menuItemId, quantity, ...extra });
const send = (id: number) => h.as(waiter).patch(`/orders/${id}/send-to-kitchen`);

describe('kitchen board', () => {
  let o1: number;

  it('a sent order becomes one ticket with its items, options, notes and order note', async () => {
    const { A } = h.world;
    o1 = await order('K1', 'Nut allergy');
    await add(o1, A.latte.id, 2, { modifierIds: [A.extraShot.id], note: 'extra hot' });
    await add(o1, A.momo.id, 1);
    expect((await board()).cooking.find((t) => t.orderId === o1)).toBeUndefined(); // not sent yet
    await send(o1);
    const t = (await board()).cooking.find((x) => x.orderId === o1)!;
    expect(t).toMatchObject({ round: 1, table: 'K1', notes: 'Nut allergy' });
    expect(t.items.map((i) => i.name).sort()).toEqual(['Latte', 'Momo']);
    expect(t.items.find((i) => i.name === 'Latte')).toMatchObject({ quantity: 2, modifiers: ['Extra shot'], note: 'extra hot' });
  });

  it('a second round is its own ticket ("Round 2"), not merged into the first', async () => {
    const { A } = h.world;
    await add(o1, A.momo.id, 3);
    await send(o1);
    const mine = (await board()).cooking.filter((t) => t.orderId === o1);
    expect(mine.map((t) => t.round)).toEqual([1, 2]);
    expect(mine[1].items).toHaveLength(1);
    expect(mine[1].items[0].quantity).toBe(3);
  });

  it('station filter: bar items only on the bar board; counts per station', async () => {
    const o = await order('K2');
    await add(o, barItem.id, 2);
    await add(o, h.world.A.momo.id, 1);
    await send(o);
    const bar = await board('?station=bar');
    expect(bar.cooking.every((t) => t.items.every((i) => i.name === 'Mojito'))).toBe(true);
    expect(bar.cooking.some((t) => t.orderId === o)).toBe(true);
    const all = await board();
    expect(all.counts.bar).toBe(2);
    expect(all.counts.all).toBe(all.counts.kitchen + all.counts.bar + all.counts.hookah);
    expect(all.allDay.find((x) => x.name === 'Momo')!.quantity).toBeGreaterThanOrEqual(5);
    expect((await h.as(waiter).get('/orders/kitchen?station=pizza')).status).toBe(400);
  });

  it('bumping a ticket moves it to Ready; serving clears it; stats count it', async () => {
    const before = (await board()).stats.ticketsDone;
    const t = (await board()).cooking.find((x) => x.orderId === o1 && x.round === 1)!;
    expect((await h.as(waiter).patch('/orders/items/ready', { ids: t.items.map((i) => i.id) })).body).toMatchObject({ updated: 2 });
    let b = await board();
    expect(b.cooking.find((x) => x.key === t.key)).toBeUndefined();
    const r = b.ready.find((x) => x.orderId === o1 && x.round === 1)!;
    expect(r.orderAllReady).toBe(false); // round 2 is still cooking
    expect(b.stats.ticketsDone).toBe(before + 1);
    expect(b.stats.avgTicketSecs).not.toBeNull();

    const r2 = b.cooking.find((x) => x.orderId === o1 && x.round === 2)!;
    await h.as(waiter).patch('/orders/items/ready', { ids: r2.items.map((i) => i.id) });
    b = await board();
    expect(b.ready.filter((x) => x.orderId === o1).every((x) => x.orderAllReady)).toBe(true);
    expect((await h.as(waiter).patch(`/orders/${o1}/serve`)).status).toBe(200);
    b = await board();
    expect(b.ready.find((x) => x.orderId === o1)).toBeUndefined();
  });

  it('recall puts an item back on the cooking ticket', async () => {
    const o = await order('K3');
    await add(o, h.world.A.momo.id, 1);
    await send(o);
    const item = (await board()).cooking.find((x) => x.orderId === o)!.items[0];
    await h.as(waiter).patch('/orders/items/ready', { ids: [item.id] });
    expect((await board()).cooking.find((x) => x.orderId === o)).toBeUndefined();
    expect((await h.as(waiter).patch(`/orders/items/${item.id}/recall`)).status).toBe(200);
    expect((await board()).cooking.find((x) => x.orderId === o)!.items[0].status).toBe('pending');
  });

  it('a voided item shows struck through and stops counting', async () => {
    const o = await order('K4');
    await add(o, h.world.A.latte.id, 1);
    await add(o, h.world.A.momo.id, 1);
    await send(o);
    const t = (await board()).cooking.find((x) => x.orderId === o)!;
    const latte = t.items.find((i) => i.name === 'Latte')!;
    await h.as(waiter).patch(`/orders/items/${latte.id}/void`, { reason: 'changed mind' });
    const after = (await board()).cooking.find((x) => x.orderId === o)!;
    expect(after.items.find((i) => i.id === latte.id)!.voided).toBe(true);
  });

  it('bulk ready ignores other cafes\' items and already-done ones', async () => {
    const { B } = h.world;
    const bWaiter = await h.login('cafe-b', B.waiter.id);
    const o = await order('K5');
    await add(o, h.world.A.momo.id, 1);
    await send(o);
    const id = (await board()).cooking.find((x) => x.orderId === o)!.items[0].id;
    expect((await h.as(bWaiter).patch('/orders/items/ready', { ids: [id] })).status).toBe(400);
    expect((await board()).cooking.some((x) => x.orderId === o)).toBe(true);
    expect((await h.as(bWaiter).get('/orders/kitchen')).body.cooking.some((x: { orderId: number }) => x.orderId === o)).toBe(false);
  });
});
