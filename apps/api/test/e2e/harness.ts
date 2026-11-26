// End-to-end harness: real Nest app (same config as main.ts) + a real
// Postgres database freshly cloned from a template that had every migration
// applied. Each test file gets its own database, so files can't interfere.
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import pg from 'pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../../src/generated/prisma/client.js';

// Where the throwaway test databases live. Point this at a LOCAL Postgres you
// don't mind tests creating/dropping databases on -- never production.
//   E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
const ADMIN_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
export const TEMPLATE_DB = 'cafepos_e2e_template';
const urlFor = (db: string) => { const u = new URL(ADMIN_URL); u.pathname = `/${db}`; return u.toString(); };

// The QA sandbox has no native Prisma engine, so it runs with the pg driver
// adapter (E2E_PRISMA_ADAPTER=pg). On a normal machine leave it unset.
async function newPrisma(url: string) {
  if (process.env.E2E_PRISMA_ADAPTER === 'pg') {
    // Variable specifier: this optional package is only installed in the QA sandbox.
    const adapterPkg = '@prisma/adapter-pg';
    const { PrismaPg } = await import(adapterPkg);
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  return new PrismaClient({ datasourceUrl: url });
}

export type World = Awaited<ReturnType<typeof seedWorld>>;

export async function bootstrap() {
  const db = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${db} TEMPLATE ${TEMPLATE_DB}`);
  await admin.end();

  process.env.DATABASE_URL = urlFor(db);
  process.env.JWT_SECRET = 'test-staff-secret';
  process.env.PLATFORM_JWT_SECRET = 'test-platform-secret';

  const prisma = await newPrisma(process.env.DATABASE_URL);
  const world = await seedWorld(prisma);

  // Import after env is set so ConfigModule/JwtModule see the secrets.
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  const http = () => request(app.getHttpServer());

  async function login(cafeSlug: string, userId: number, pin = '1234') {
    const res = await http().post('/auth/login').send({ cafeSlug, userId, pin });
    if (res.status !== 201) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.accessToken as string;
  }
  async function platformLogin() {
    const res = await http().post('/platform/auth/login').send({ username: 'root', password: 'root-password-123' });
    if (res.status !== 201) throw new Error(`platform login failed ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.accessToken as string;
  }

  /** Auth'd request helpers: as(token).get(...) */
  const as = (token: string) => ({
    get: (u: string) => http().get(u).set('Authorization', `Bearer ${token}`),
    post: (u: string, b?: object) => http().post(u).set('Authorization', `Bearer ${token}`).send(b ?? {}),
    patch: (u: string, b?: object) => http().patch(u).set('Authorization', `Bearer ${token}`).send(b ?? {}),
    delete: (u: string) => http().delete(u).set('Authorization', `Bearer ${token}`),
  });

  async function close() {
    await app.close();
    await prisma.$disconnect();
    const a = new pg.Client({ connectionString: ADMIN_URL });
    await a.connect();
    await a.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await a.end();
  }

  return { app, http, prisma, world, login, platformLogin, as, close };
}

/** Two cafes (A on trial = every feature, B on starter) so isolation can be tested. */
export async function seedWorld(prisma: PrismaClient) {
  const pin = await bcrypt.hash('1234', 4);
  await prisma.platformUser.create({ data: { username: 'root', passwordHash: await bcrypt.hash('root-password-123', 4) } });

  async function cafe(slug: string, plan: 'starter' | 'standard' | 'premium', status: 'trial' | 'active') {
    const c = await prisma.cafe.create({ data: { name: slug.toUpperCase(), slug, plan, subscriptionStatus: status } });
    const [admin, cashier, waiter] = await Promise.all(
      (['admin', 'cashier', 'waiter'] as const).map((role) =>
        prisma.user.create({ data: { cafeId: c.id, name: `${slug}-${role}`, role, pinHash: pin } }),
      ),
    );
    const t1 = await prisma.restaurantTable.create({ data: { cafeId: c.id, tableNumber: '1', capacity: 4 } });
    const t2 = await prisma.restaurantTable.create({ data: { cafeId: c.id, tableNumber: '2', capacity: 2 } });
    const cat = await prisma.menuCategory.create({ data: { cafeId: c.id, name: 'Drinks', sortOrder: 1 } });
    const latte = await prisma.menuItem.create({ data: { cafeId: c.id, categoryId: cat.id, name: 'Latte', price: 250 } });
    const momo = await prisma.menuItem.create({ data: { cafeId: c.id, categoryId: cat.id, name: 'Momo', price: 180 } });
    const extraShot = await prisma.modifier.create({ data: { menuItemId: latte.id, name: 'Extra shot', priceDelta: 50 } });
    return { cafe: c, admin, cashier, waiter, t1, t2, cat, latte, momo, extraShot };
  }
  const A = await cafe('cafe-a', 'premium', 'trial');
  const B = await cafe('cafe-b', 'starter', 'active');
  return { A, B };
}
