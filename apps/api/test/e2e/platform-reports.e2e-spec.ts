import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
let platform: string, admin: string;
beforeAll(async () => {
  h = await bootstrap();
  platform = await h.platformLogin();
  admin = await h.login('cafe-a', h.world.A.admin.id);
});
afterAll(async () => { await h?.close(); });

describe('platform panel', () => {
  it('overview, cafe list and detail respond', async () => {
    expect((await h.as(platform).get('/platform/overview')).status).toBe(200);
    const list = await h.as(platform).get('/platform/cafes');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect((await h.as(platform).get(`/platform/cafes/${h.world.A.cafe.id}`)).status).toBe(200);
    expect((await h.as(platform).get('/platform/cafes/999999')).status).toBe(404);
  });

  it('onboards a cafe whose admin can then log in; duplicate slug is refused', async () => {
    const res = await h.as(platform).post('/platform/cafes', { name: 'New Cafe', slug: 'new-cafe', adminName: 'Owner', adminPin: '2580' });
    expect(res.status).toBe(201);
    const ownerId = res.body.users[0].id;
    expect((await h.http().post('/auth/login').send({ cafeSlug: 'new-cafe', userId: ownerId, pin: '2580' })).status).toBe(201);
    expect((await h.as(platform).post('/platform/cafes', { name: 'Dup', slug: 'new-cafe', adminName: 'X', adminPin: '1111' })).status).toBe(409);
    expect((await h.as(platform).post('/platform/cafes', { name: 'Bad', slug: 'Bad Slug!', adminName: 'X', adminPin: '1111' })).status).toBe(400);
  });

  it('turning a feature on for a plan takes effect immediately', async () => {
    const bAdmin = await h.login('cafe-b', h.world.B.admin.id);
    expect((await h.as(bAdmin).get('/inventory/items')).status).toBe(403);
    expect((await h.as(platform).patch('/platform/plans/starter', { inventory: true })).status).toBe(200);
    expect((await h.as(bAdmin).get('/inventory/items')).status).toBe(200);
    await h.as(platform).patch('/platform/plans/starter', { inventory: false });
  });

  it('an overdue cafe cannot open new orders', async () => {
    const { B } = h.world;
    await h.as(platform).patch(`/platform/cafes/${B.cafe.id}`, { subscriptionStatus: 'overdue' });
    const bWaiter = await h.login('cafe-b', B.waiter.id);
    expect((await h.as(bWaiter).post('/orders', { tableId: B.t2.id, waiterId: B.waiter.id, orderType: 'dine_in' })).status).toBe(403);
    expect((await h.as(platform).post(`/platform/cafes/${B.cafe.id}/payments`, { amount: 999, method: 'esewa' })).status).toBe(201);
    expect((await h.as(bWaiter).post('/orders', { tableId: B.t2.id, waiterId: B.waiter.id, orderType: 'dine_in' })).status).toBe(201);
  });

  it('reset PIN works only for a user of that cafe', async () => {
    const { A, B } = h.world;
    expect((await h.as(platform).post(`/platform/cafes/${A.cafe.id}/users/${B.waiter.id}/reset-pin`, { pin: '1111' })).status).toBe(404);
    expect((await h.as(platform).post(`/platform/cafes/${A.cafe.id}/users/${A.waiter.id}/reset-pin`, { pin: '1111' })).status).toBe(201);
  });
});

describe('reports', () => {
  it.each(['overview', 'items', 'staff', 'bills', 'exceptions', 'shifts', 'purchases', 'stock', 'profit'])('/reports/%s works with filters', async (r) => {
    const res = await h.as(admin).get(`/reports/${r}?from=2026-01-01&to=2026-12-31&staffId=${h.world.A.waiter.id}&tz=345&groupBy=day`);
    expect(res.status).toBe(200);
  });
  it('rejects a junk filter instead of crashing', async () => {
    expect((await h.as(admin).get('/reports/overview?staffId=abc')).status).toBe(400);
    expect((await h.as(admin).get('/reports/overview?from=not-a-date')).status).toBe(400);
  });
  it('starter plan gets 403 on reports', async () => {
    const bAdmin = await h.login('cafe-b', h.world.B.admin.id);
    expect((await h.as(bAdmin).get('/reports/overview')).status).toBe(403);
  });
});

describe('partial updates never wipe fields that were not sent', () => {
  it('changing only the plan keeps logo, PAN, billing date and notes', async () => {
    const { A } = h.world;
    const due = new Date(Date.now() + 20 * 86400000);
    await h.prisma.cafe.update({
      where: { id: A.cafe.id },
      data: { logoUrl: '/uploads/logos/x.png', themeColor: '#123456', panNumber: '123456789', nextBillingAt: due, subscriptionNotes: 'paid Rs 1999 via esewa' },
    });
    expect((await h.as(platform).patch(`/platform/cafes/${A.cafe.id}`, { plan: 'premium' })).status).toBe(200);
    const c = await h.prisma.cafe.findUniqueOrThrow({ where: { id: A.cafe.id } });
    expect(c.plan).toBe('premium');
    expect(c).toMatchObject({ logoUrl: '/uploads/logos/x.png', themeColor: '#123456', panNumber: '123456789', subscriptionNotes: 'paid Rs 1999 via esewa' });
    expect(c.nextBillingAt?.getTime()).toBe(due.getTime());
    // sending null on purpose still clears
    await h.as(platform).patch(`/platform/cafes/${A.cafe.id}`, { logoUrl: null });
    expect((await h.prisma.cafe.findUniqueOrThrow({ where: { id: A.cafe.id } })).logoUrl).toBeNull();
  });

  it('toggling one plan feature keeps that plan\'s limits', async () => {
    const before = await h.prisma.planConfig.findUniqueOrThrow({ where: { key: 'standard' } });
    expect((await h.as(platform).patch('/platform/plans/standard', { tableGame: true })).status).toBe(200);
    const after = await h.prisma.planConfig.findUniqueOrThrow({ where: { key: 'standard' } });
    expect(after).toMatchObject({ maxStaff: before.maxStaff, maxMenuItems: before.maxMenuItems, maxTables: before.maxTables, tableGame: true });
    await h.as(platform).patch('/platform/plans/standard', { maxTables: null });
    expect((await h.prisma.planConfig.findUniqueOrThrow({ where: { key: 'standard' } })).maxTables).toBeNull();
    await h.as(platform).patch('/platform/plans/standard', { tableGame: false, maxTables: before.maxTables });
  });

  it('cafe settings: saving the colour keeps the logo and the other way round', async () => {
    const { A } = h.world;
    await h.prisma.cafe.update({ where: { id: A.cafe.id }, data: { logoUrl: '/uploads/logos/y.png', themeColor: '#654321' } });
    expect((await h.as(admin).patch('/cafes/settings', { tagline: 'hello' })).status).toBe(200);
    expect(await h.prisma.cafe.findUniqueOrThrow({ where: { id: A.cafe.id } })).toMatchObject({ logoUrl: '/uploads/logos/y.png', themeColor: '#654321', tagline: 'hello' });
  });
});
