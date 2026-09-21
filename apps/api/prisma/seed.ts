import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Onboards one cafe end-to-end: creates the Cafe row, its menu, and its
// staff. This is the closest thing to a "create cafe" flow that exists
// right now -- there's no self-serve signup yet, so a new tenant gets
// added by calling this once with that cafe's details (see main() below).
async function seedCafe(opts: {
  slug: string;
  name: string;
  adminPin: string;
  cashierPin: string;
}) {
  const cafe = await prisma.cafe.upsert({
    where: { slug: opts.slug },
    update: {},
    create: { slug: opts.slug, name: opts.name },
  });

  const beverages = await prisma.menuCategory.upsert({
    where: { cafeId_name: { cafeId: cafe.id, name: 'Beverages' } },
    update: {},
    create: { cafeId: cafe.id, name: 'Beverages', sortOrder: 1 },
  });

  const snacks = await prisma.menuCategory.upsert({
    where: { cafeId_name: { cafeId: cafe.id, name: 'Snacks' } },
    update: {},
    create: { cafeId: cafe.id, name: 'Snacks', sortOrder: 2 },
  });

  await prisma.menuItem.upsert({
    where: { cafeId_name: { cafeId: cafe.id, name: 'Americano' } },
    update: {},
    create: {
      cafeId: cafe.id,
      name: 'Americano',
      price: 150,
      categoryId: beverages.id,
      modifiers: {
        create: [
          { name: 'Large', priceDelta: 20 },
          { name: 'Extra Shot', priceDelta: 30 },
        ],
      },
    },
  });

  await prisma.menuItem.upsert({
    where: { cafeId_name: { cafeId: cafe.id, name: 'Mo:Mo' } },
    update: {},
    create: { cafeId: cafe.id, name: 'Mo:Mo', price: 120, categoryId: snacks.id },
  });

  await prisma.menuItem.upsert({
    where: { cafeId_name: { cafeId: cafe.id, name: 'Carrot Cake' } },
    update: {},
    create: { cafeId: cafe.id, name: 'Carrot Cake', price: 150, categoryId: snacks.id },
  });

  const cashierPinHash = await bcrypt.hash(opts.cashierPin, 10);
  await prisma.user.upsert({
    where: { cafeId_name: { cafeId: cafe.id, name: 'Sita' } },
    update: {},
    create: { cafeId: cafe.id, name: 'Sita', pinHash: cashierPinHash, role: 'cashier' },
  });

  const adminPinHash = await bcrypt.hash(opts.adminPin, 10);
  await prisma.user.upsert({
    where: { cafeId_name: { cafeId: cafe.id, name: 'Admin' } },
    update: {},
    create: { cafeId: cafe.id, name: 'Admin', pinHash: adminPinHash, role: 'admin' },
  });

  return cafe;
}

// Creates or updates the one superadmin account used to log into
// /platform, from env vars rather than hardcoded values -- same reasoning
// as seedCafe() being a repeatable upsert rather than a one-time script.
async function seedPlatformUser() {
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!username || !password) {
    console.log('Skipping superadmin seed -- SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD not set in .env');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.platformUser.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  console.log(`Superadmin "${username}" is ready -- log in at /platform/login`);
}

async function main() {
  const cafe = await seedCafe({
    slug: 'mittho-cafe',
    name: 'Mittho Cafe',
    adminPin: '9999',
    cashierPin: '5678',
  });

  console.log(`Seed data is up to date. Log in at /c/${cafe.slug}/login`);

  await seedPlatformUser();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
