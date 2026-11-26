import { bootstrap } from './harness.js';

let h: Awaited<ReturnType<typeof bootstrap>>;
let admin: string, cashier: string, waiter: string;
beforeAll(async () => {
  h = await bootstrap();
  const { A } = h.world;
  [admin, cashier, waiter] = await Promise.all([h.login('cafe-a', A.admin.id), h.login('cafe-a', A.cashier.id), h.login('cafe-a', A.waiter.id)]);
});
afterAll(async () => { await h?.close(); });

describe('role permissions', () => {
  it.each([
    ['get', '/users'], ['post', '/users'], ['get', '/reports/overview'], ['patch', '/cafes/settings'],
    ['post', '/menu'], ['post', '/tables'], ['get', '/shifts/current'], ['post', '/orders/1/payments'],
    ['patch', '/orders/1/discount'], ['get', '/orders/bills'], ['post', '/inventory/items'], ['post', '/uploads/image/menu'],
  ])('waiter is forbidden: %s %s', async (m, url) => {
    const res = await (h.as(waiter) as any)[m](url, {});
    expect(res.status).toBe(403);
  });

  it.each([
    ['get', '/users'], ['patch', '/cafes/settings'], ['post', '/menu'], ['post', '/tables'],
    ['get', '/reports/overview'], ['post', '/inventory/items'], ['get', '/shifts'],
  ])('cashier is forbidden: %s %s', async (m, url) => {
    const res = await (h.as(cashier) as any)[m](url, {});
    expect(res.status).toBe(403);
  });

  it('cashier can run the till: open shift, see bills', async () => {
    expect((await h.as(cashier).post('/shifts/open', { openingCash: 1000 })).status).toBe(201);
    expect((await h.as(cashier).get('/orders/bills')).status).toBe(200);
  });
});

describe('staff management', () => {
  it('creates staff, refuses duplicate names and non-digit PINs, never returns the hash', async () => {
    const res = await h.as(admin).post('/users', { name: 'Hari', pin: '4321', role: 'waiter' });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('pinHash');
    expect((await h.as(admin).post('/users', { name: 'Hari', pin: '4321', role: 'waiter' })).status).toBe(400);
    expect((await h.as(admin).post('/users', { name: 'Letters', pin: 'abcd', role: 'waiter' })).status).toBe(400);
    expect((await h.as(admin).post('/users', { name: 'Boss', pin: '1111', role: 'superadmin' })).status).toBe(400);
  });

  it('a new PIN works and the old one stops working', async () => {
    const { A } = h.world;
    expect((await h.as(admin).patch(`/users/${A.cashier.id}`, { pin: '5678' })).status).toBe(200);
    expect((await h.http().post('/auth/login').send({ cafeSlug: 'cafe-a', userId: A.cashier.id, pin: '1234' })).status).toBe(401);
    expect((await h.http().post('/auth/login').send({ cafeSlug: 'cafe-a', userId: A.cashier.id, pin: '5678' })).status).toBe(201);
  });

  it('the last active admin cannot be deactivated or demoted (would lock the cafe out)', async () => {
    const { A } = h.world;
    expect((await h.as(admin).patch(`/users/${A.admin.id}`, { isActive: false })).status).toBe(400);
    expect((await h.as(admin).patch(`/users/${A.admin.id}`, { role: 'waiter' })).status).toBe(400);
    // with a second admin it is allowed
    const second = await h.as(admin).post('/users', { name: 'Co-owner', pin: '2468', role: 'admin' });
    expect((await h.as(admin).patch(`/users/${A.admin.id}`, { role: 'cashier' })).status).toBe(200);
    await h.prisma.user.update({ where: { id: A.admin.id }, data: { role: 'admin' } });
    await h.prisma.user.update({ where: { id: second.body.id }, data: { isActive: false } });
  });

  it('starter plan staff limit counts only active staff', async () => {
    const { B } = h.world; // starter: max 3, already has 3
    const bAdmin = await h.login('cafe-b', B.admin.id);
    expect((await h.as(bAdmin).post('/users', { name: 'Fourth', pin: '1357', role: 'waiter' })).status).toBe(403);
    expect((await h.as(bAdmin).patch(`/users/${B.cashier.id}`, { isActive: false })).status).toBe(200);
    expect((await h.as(bAdmin).post('/users', { name: 'Replacement', pin: '1357', role: 'cashier' })).status).toBe(201);
    // re-activating the old one would exceed the limit again
    expect((await h.as(bAdmin).patch(`/users/${B.cashier.id}`, { isActive: true })).status).toBe(403);
  });
});

describe('uploads', () => {
  it('accepts a real PNG and rejects a fake one / wrong kind / no file', async () => {
    const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA6364F8FFBF1E000500017A2F7B7A0000000049454E44AE426082', 'hex');
    const ok = await h.http().post('/uploads/image/menu').set('Authorization', `Bearer ${admin}`).attach('file', png, { filename: 'a.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/^\/uploads\/menu\/cafe-\d+-.+\.png$/);
    const served = await h.http().get(ok.body.url);
    expect(served.status).toBe(200);

    const fake = await h.http().post('/uploads/image/menu').set('Authorization', `Bearer ${admin}`).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const badKind = await h.http().post('/uploads/image/../../etc').set('Authorization', `Bearer ${admin}`).attach('file', png, { filename: 'a.png', contentType: 'image/png' });
    expect([400, 404]).toContain(badKind.status);
    expect((await h.http().post('/uploads/image/menu').set('Authorization', `Bearer ${admin}`)).status).toBe(400);
  });

  it('logo upload: an HTML file named .html but labelled image/png is refused, a real PNG is saved as .png', async () => {
    const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA6364F8FFBF1E000500017A2F7B7A0000000049454E44AE426082', 'hex');
    const evil = await h.http().post('/cafes/settings/logo').set('Authorization', `Bearer ${admin}`).attach('logo', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'x.html', contentType: 'image/png' });
    expect(evil.status).toBe(400);
    const svg = await h.http().post('/cafes/settings/logo').set('Authorization', `Bearer ${admin}`).attach('logo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
    expect(svg.status).toBe(400);
    const ok = await h.http().post('/cafes/settings/logo').set('Authorization', `Bearer ${admin}`).attach('logo', png, { filename: 'logo.html', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    expect(ok.body.logoUrl).toMatch(/\.png$/);
  });
});

describe('role changes take effect immediately', () => {
  it('an admin demoted to waiter loses admin routes on their current session', async () => {
    const { A } = h.world;
    const co = await h.as(admin).post('/users', { name: 'Temp admin', pin: '9753', role: 'admin' });
    const coToken = await h.login('cafe-a', co.body.id, '9753');
    expect((await h.as(coToken).get('/users')).status).toBe(200);
    expect((await h.as(admin).patch(`/users/${co.body.id}`, { role: 'waiter' })).status).toBe(200);
    expect((await h.as(coToken).get('/users')).status).toBe(403);
    void A;
  });
});


describe('staff photos', () => {
  const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA6364F8FFBF1E000500017A2F7B7A0000000049454E44AE426082', 'hex');

  it('admin uploads a staff photo, sets it, and it shows on the login screen and in the login response', async () => {
    const { A } = h.world;
    const up = await h.http().post('/uploads/image/staff').set('Authorization', `Bearer ${admin}`).attach('file', png, { filename: 'me.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body.url).toMatch(/^\/uploads\/staff\//);
    const set = await h.as(admin).patch(`/users/${A.waiter.id}`, { avatarUrl: up.body.url });
    expect(set.status).toBe(200);
    expect(set.body.avatarUrl).toBe(up.body.url);
    const staff = await h.http().get('/cafes/cafe-a/staff');
    expect(staff.body.find((s: { id: number }) => s.id === A.waiter.id).avatarUrl).toBe(up.body.url);
    const login = await h.http().post('/auth/login').send({ cafeSlug: 'cafe-a', userId: A.waiter.id, pin: '1234' });
    expect(login.body.user.avatarUrl).toBe(up.body.url);
    // an unrelated update leaves the photo alone; null removes it
    await h.as(admin).patch(`/users/${A.waiter.id}`, { name: 'cafe-a-waiter' });
    expect((await h.prisma.user.findUniqueOrThrow({ where: { id: A.waiter.id } })).avatarUrl).toBe(up.body.url);
    expect((await h.as(admin).patch(`/users/${A.waiter.id}`, { avatarUrl: null })).body.avatarUrl).toBeNull();
  });

  it('refuses an avatarUrl that is not one of our staff uploads', async () => {
    const { A } = h.world;
    for (const bad of ['https://evil.example/x.png', '/uploads/menu/x.png', '/uploads/staff/../../etc/passwd', 'javascript:alert(1)']) {
      expect((await h.as(admin).patch(`/users/${A.waiter.id}`, { avatarUrl: bad })).status).toBe(400);
    }
  });

  it('a waiter cannot upload or set photos', async () => {
    expect((await h.http().post('/uploads/image/staff').set('Authorization', `Bearer ${waiter}`).attach('file', png, { filename: 'a.png', contentType: 'image/png' })).status).toBe(403);
    expect((await h.as(waiter).patch(`/users/${h.world.A.waiter.id}`, { avatarUrl: null })).status).toBe(403);
  });
});
