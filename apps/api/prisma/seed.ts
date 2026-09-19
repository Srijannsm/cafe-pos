import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const beverages = await prisma.menuCategory.upsert({
    where: { name: 'Beverages' },
    update: {},
    create: { name: 'Beverages', sortOrder: 1 },
  });

  const snacks = await prisma.menuCategory.upsert({
    where: { name: 'Snacks' },
    update: {},
    create: { name: 'Snacks', sortOrder: 2 },
  });

  await prisma.menuItem.upsert({
    where: { name: 'Americano' },
    update: {},
    create: {
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
    where: { name: 'Mo:Mo' },
    update: {},
    create: { name: 'Mo:Mo', price: 120, categoryId: snacks.id },
  });

  await prisma.menuItem.upsert({
    where: { name: 'Carrot Cake' },
    update: {},
    create: { name: 'Carrot Cake', price: 150, categoryId: snacks.id },
  });

  const cashierPinHash = await bcrypt.hash('5678', 10);
  await prisma.user.upsert({
    where: { name: 'Sita' },
    update: {},
    create: { name: 'Sita', pinHash: cashierPinHash, role: 'cashier' },
  });

  const adminPinHash = await bcrypt.hash('9999', 10);
await prisma.user.upsert({
  where: { name: 'Admin' },
  update: {},
  create: { name: 'Admin', pinHash: adminPinHash, role: 'admin' },
});

  console.log('Seed data is up to date.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });