import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
beforeAll(async () => { h = await bootstrap(); });
afterAll(async () => { await h?.close(); });

describe('staff login', () => {
  it('logs in with the right PIN and returns a token scoped to the cafe', async () => {
    const { A } = h.world;
    const res = await h.http().post('/auth/login').send({ cafeSlug: 'cafe-a', userId: A.waiter.id, pin: '1234' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: A.waiter.id, role: 'waiter', cafeId: A.cafe.id });
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong PIN with 401', async () => {
    const res = await h.http().post('/auth/login').send({ cafeSlug: 'cafe-a', userId: h.world.A.cashier.id, pin: '0000' });
    expect(res.status).toBe(401);
  });

  it("rejects a valid user id + PIN against another cafe's slug", async () => {
    const res = await h.http().post('/auth/login').send({ cafeSlug: 'cafe-b', userId: h.world.A.admin.id, pin: '1234' });
    expect(res.status).toBe(401);
  });

  it('locks a staff member out after 5 wrong PINs (429)', async () => {
    const u = h.world.B.waiter.id;
    for (let i = 0; i < 5; i++) await h.http().post('/auth/login').send({ cafeSlug: 'cafe-b', userId: u, pin: '9999' });
    const res = await h.http().post('/auth/login').send({ cafeSlug: 'cafe-b', userId: u, pin: '1234' });
    expect(res.status).toBe(429);
  });

  it('validates the body (400 on a 3-digit PIN or missing fields)', async () => {
    expect((await h.http().post('/auth/login').send({ cafeSlug: 'cafe-a', userId: 1, pin: '123' })).status).toBe(400);
    expect((await h.http().post('/auth/login').send({})).status).toBe(400);
  });
});

describe('public cafe endpoints', () => {
  it('serves cafe branding and the staff list without auth, never the PIN hash', async () => {
    const info = await h.http().get('/cafes/cafe-a');
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ slug: 'cafe-a' });
    const staff = await h.http().get('/cafes/cafe-a/staff');
    expect(staff.status).toBe(200);
    expect(staff.body.length).toBe(3);
    expect(JSON.stringify(staff.body)).not.toContain('pinHash');
    expect(JSON.stringify(staff.body)).not.toContain('$2');
  });
  it('404s for an unknown slug', async () => {
    expect((await h.http().get('/cafes/nope')).status).toBe(404);
  });
});

describe('protected routes', () => {
  it('401 without a token, 401 with a garbage token', async () => {
    expect((await h.http().get('/orders')).status).toBe(401);
    expect((await h.http().get('/orders').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
  });

  it('a platform token is not accepted on staff routes and vice versa', async () => {
    const platform = await h.platformLogin();
    const staff = await h.login('cafe-a', h.world.A.admin.id);
    expect((await h.as(platform).get('/orders')).status).toBe(401);
    expect((await h.as(staff).get('/platform/overview')).status).toBe(401);
  });

  it("a deactivated staff member's existing session stops working", async () => {
    const { A } = h.world;
    const victim = await h.prisma.user.create({ data: { cafeId: A.cafe.id, name: 'temp-waiter', role: 'waiter', pinHash: (await h.prisma.user.findUniqueOrThrow({ where: { id: A.waiter.id } })).pinHash } });
    const token = await h.login('cafe-a', victim.id);
    expect((await h.as(token).get('/tables')).status).toBe(200);
    const admin = await h.login('cafe-a', A.admin.id);
    expect((await h.as(admin).patch(`/users/${victim.id}`, { isActive: false })).status).toBe(200);
    expect((await h.as(token).get('/tables')).status).toBe(401);
    // and can't log in again
    expect((await h.http().post('/auth/login').send({ cafeSlug: 'cafe-a', userId: victim.id, pin: '1234' })).status).toBe(401);
  });

  it("deactivating a cafe from the platform cuts off its staff's existing sessions", async () => {
    const extra = await h.prisma.cafe.create({ data: { name: 'Temp', slug: 'temp-cafe' } });
    const u = await h.prisma.user.create({ data: { cafeId: extra.id, name: 'boss', role: 'admin', pinHash: (await h.prisma.user.findUniqueOrThrow({ where: { id: h.world.A.admin.id } })).pinHash } });
    const token = await h.login('temp-cafe', u.id);
    expect((await h.as(token).get('/tables')).status).toBe(200);
    const platform = await h.platformLogin();
    expect((await h.as(platform).patch(`/platform/cafes/${extra.id}`, { isActive: false })).status).toBe(200);
    expect((await h.as(token).get('/tables')).status).toBe(401);
    expect((await h.http().get('/cafes/temp-cafe')).status).toBe(404);
  });
});

describe('platform login', () => {
  it('rejects a wrong password', async () => {
    expect((await h.http().post('/platform/auth/login').send({ username: 'root', password: 'nope-nope' })).status).toBe(401);
  });
});
