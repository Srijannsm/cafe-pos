import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Categories
  const beverages = await prisma.menuCategory.create({
    data: { name: 'Beverages', sortOrder: 1 },
  });
  const snacks = await prisma.menuCategory.create({
    data: { name: 'Snacks', sortOrder: 2 },
  });

  // Americano, with two modifiers created in the same step
  await prisma.menuItem.create({
    data: {
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

  await prisma.menuItem.create({
    data: { name: 'Mo:Mo', price: 120, categoryId: snacks.id },
  });

  await prisma.menuItem.create({
    data: { name: 'Carrot Cake', price: 150, categoryId: snacks.id },
  });

  // A table
  await prisma.restaurantTable.create({
    data: { tableNumber: 'Table 1', capacity: 4 },
  });

  // A waiter — PIN is hashed before storage, never plain text
  const pinHash = await bcrypt.hash('1234', 10);
  await prisma.user.create({
    data: { name: 'Ram', pinHash, role: 'waiter' },
  });

  console.log('Seed data created successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

  const cashierPinHash = await bcrypt.hash('5678', 10);
await prisma.user.create({
  data: { name: 'Sita', pinHash: cashierPinHash, role: 'cashier' },
});