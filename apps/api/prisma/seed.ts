import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedCafe() {
  // ── Cafe ─────────────────────────────────────────────────────────────────
  const cafe = await prisma.cafe.upsert({
    where: { slug: 'mittho-cafe' },
    update: {},
    create: { slug: 'mittho-cafe', name: 'Mittho Cafe' },
  });

  // ── Staff ─────────────────────────────────────────────────────────────────
  const staff = [
    { name: 'Admin',  pin: '9999', role: 'admin'   as const },
    { name: 'Sita',   pin: '1111', role: 'cashier' as const },
    { name: 'Ram',    pin: '2222', role: 'cashier' as const },
    { name: 'Gita',   pin: '3333', role: 'cashier' as const },
  ];
  for (const s of staff) {
    const hash = await bcrypt.hash(s.pin, 10);
    await prisma.user.upsert({
      where: { cafeId_name: { cafeId: cafe.id, name: s.name } },
      update: {},
      create: { cafeId: cafe.id, name: s.name, pinHash: hash, role: s.role },
    });
  }

  // ── Tables ────────────────────────────────────────────────────────────────
  const tables = [
    { tableNumber: 'T1', capacity: 2 },
    { tableNumber: 'T2', capacity: 2 },
    { tableNumber: 'T3', capacity: 4 },
    { tableNumber: 'T4', capacity: 4 },
    { tableNumber: 'T5', capacity: 4 },
    { tableNumber: 'T6', capacity: 6 },
    { tableNumber: 'T7', capacity: 6 },
    { tableNumber: 'Bar-1', capacity: 1 },
    { tableNumber: 'Bar-2', capacity: 1 },
    { tableNumber: 'Bar-3', capacity: 1 },
  ];
  for (const t of tables) {
    const existing = await prisma.restaurantTable.findFirst({
      where: { cafeId: cafe.id, tableNumber: t.tableNumber },
    });
    if (!existing) {
      await prisma.restaurantTable.create({
        data: { cafeId: cafe.id, ...t },
      });
    }
  }

  // ── Menu categories ───────────────────────────────────────────────────────
  const categoryDefs = [
    { name: 'Hot Drinks',   sortOrder: 1 },
    { name: 'Cold Drinks',  sortOrder: 2 },
    { name: 'Breakfast',    sortOrder: 3 },
    { name: 'Snacks',       sortOrder: 4 },
    { name: 'Main Course',  sortOrder: 5 },
    { name: 'Desserts',     sortOrder: 6 },
  ];
  const cats: Record<string, number> = {};
  for (const c of categoryDefs) {
    const cat = await prisma.menuCategory.upsert({
      where: { cafeId_name: { cafeId: cafe.id, name: c.name } },
      update: {},
      create: { cafeId: cafe.id, ...c },
    });
    cats[c.name] = cat.id;
  }

  // ── Menu items ────────────────────────────────────────────────────────────
  type ItemDef = {
    name: string; price: number; category: string;
    modifiers?: { name: string; priceDelta: number }[];
  };

  const items: ItemDef[] = [
    // Hot Drinks
    { name: 'Espresso',       price: 120, category: 'Hot Drinks',
      modifiers: [{ name: 'Double Shot', priceDelta: 40 }] },
    { name: 'Americano',      price: 150, category: 'Hot Drinks',
      modifiers: [{ name: 'Large', priceDelta: 30 }, { name: 'Extra Shot', priceDelta: 40 }] },
    { name: 'Cappuccino',     price: 180, category: 'Hot Drinks',
      modifiers: [{ name: 'Large', priceDelta: 30 }, { name: 'Oat Milk', priceDelta: 30 }] },
    { name: 'Latte',          price: 190, category: 'Hot Drinks',
      modifiers: [{ name: 'Large', priceDelta: 30 }, { name: 'Oat Milk', priceDelta: 30 }, { name: 'Vanilla Syrup', priceDelta: 20 }] },
    { name: 'Flat White',     price: 180, category: 'Hot Drinks' },
    { name: 'Masala Chai',    price: 100, category: 'Hot Drinks',
      modifiers: [{ name: 'Extra Ginger', priceDelta: 0 }] },
    { name: 'Hot Chocolate',  price: 160, category: 'Hot Drinks',
      modifiers: [{ name: 'Large', priceDelta: 30 }, { name: 'Whipped Cream', priceDelta: 20 }] },

    // Cold Drinks
    { name: 'Iced Americano', price: 170, category: 'Cold Drinks',
      modifiers: [{ name: 'Large', priceDelta: 30 }] },
    { name: 'Iced Latte',     price: 210, category: 'Cold Drinks',
      modifiers: [{ name: 'Vanilla Syrup', priceDelta: 20 }, { name: 'Oat Milk', priceDelta: 30 }] },
    { name: 'Cold Brew',      price: 220, category: 'Cold Drinks' },
    { name: 'Mango Lassi',    price: 140, category: 'Cold Drinks' },
    { name: 'Fresh Lime Soda',price: 110, category: 'Cold Drinks',
      modifiers: [{ name: 'Sweet', priceDelta: 0 }, { name: 'Salted', priceDelta: 0 }] },
    { name: 'Watermelon Juice', price: 130, category: 'Cold Drinks' },

    // Breakfast
    { name: 'Veg Omelette',   price: 160, category: 'Breakfast',
      modifiers: [{ name: 'Extra Egg', priceDelta: 40 }, { name: 'Add Cheese', priceDelta: 30 }] },
    { name: 'Egg Benedict',   price: 250, category: 'Breakfast' },
    { name: 'Avocado Toast',  price: 280, category: 'Breakfast',
      modifiers: [{ name: 'Add Egg', priceDelta: 40 }] },
    { name: 'Pancakes',       price: 220, category: 'Breakfast',
      modifiers: [{ name: 'Maple Syrup', priceDelta: 20 }, { name: 'Banana & Honey', priceDelta: 30 }] },
    { name: 'French Toast',   price: 200, category: 'Breakfast' },
    { name: 'Granola Bowl',   price: 190, category: 'Breakfast' },

    // Snacks
    { name: 'Chicken Mo:Mo',  price: 160, category: 'Snacks',
      modifiers: [{ name: 'Steam', priceDelta: 0 }, { name: 'Fried', priceDelta: 20 }, { name: 'Jhol', priceDelta: 10 }] },
    { name: 'Veg Mo:Mo',      price: 130, category: 'Snacks',
      modifiers: [{ name: 'Steam', priceDelta: 0 }, { name: 'Fried', priceDelta: 20 }] },
    { name: 'Club Sandwich',  price: 220, category: 'Snacks',
      modifiers: [{ name: 'Add Fries', priceDelta: 60 }] },
    { name: 'Garlic Bread',   price: 120, category: 'Snacks',
      modifiers: [{ name: 'Add Cheese', priceDelta: 30 }] },
    { name: 'Spring Rolls',   price: 140, category: 'Snacks' },
    { name: 'French Fries',   price: 130, category: 'Snacks',
      modifiers: [{ name: 'Large', priceDelta: 40 }, { name: 'Masala', priceDelta: 0 }] },
    { name: 'Onion Rings',    price: 120, category: 'Snacks' },

    // Main Course
    { name: 'Dal Bhat Tarkari', price: 220, category: 'Main Course',
      modifiers: [{ name: 'Extra Dal', priceDelta: 40 }] },
    { name: 'Thukpa',         price: 200, category: 'Main Course',
      modifiers: [{ name: 'Chicken', priceDelta: 50 }, { name: 'Veg', priceDelta: 0 }] },
    { name: 'Fried Rice',     price: 180, category: 'Main Course',
      modifiers: [{ name: 'Chicken', priceDelta: 40 }, { name: 'Veg', priceDelta: 0 }, { name: 'Egg', priceDelta: 20 }] },
    { name: 'Chowmein',       price: 160, category: 'Main Course',
      modifiers: [{ name: 'Chicken', priceDelta: 40 }, { name: 'Veg', priceDelta: 0 }] },
    { name: 'Pasta Arrabiata', price: 260, category: 'Main Course' },
    { name: 'Margherita Pizza', price: 380, category: 'Main Course',
      modifiers: [{ name: 'Extra Cheese', priceDelta: 50 }, { name: 'Thin Crust', priceDelta: 0 }] },

    // Desserts
    { name: 'Chocolate Brownie', price: 170, category: 'Desserts',
      modifiers: [{ name: 'With Ice Cream', priceDelta: 50 }] },
    { name: 'Carrot Cake',    price: 160, category: 'Desserts' },
    { name: 'Cheesecake',     price: 200, category: 'Desserts',
      modifiers: [{ name: 'Blueberry', priceDelta: 20 }, { name: 'Strawberry', priceDelta: 20 }] },
    { name: 'Mango Sorbet',   price: 140, category: 'Desserts' },
    { name: 'Gulab Jamun',    price: 100, category: 'Desserts' },
  ];

  for (const item of items) {
    await prisma.menuItem.upsert({
      where: { cafeId_name: { cafeId: cafe.id, name: item.name } },
      update: {},
      create: {
        cafeId: cafe.id,
        name: item.name,
        price: item.price,
        categoryId: cats[item.category],
        modifiers: item.modifiers
          ? { create: item.modifiers }
          : undefined,
      },
    });
  }

  return cafe;
}

async function seedPlatformUser() {
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!username || !password) {
    console.log('Skipping superadmin — SUPERADMIN_USERNAME/SUPERADMIN_PASSWORD not set');
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.platformUser.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });
  console.log(`Superadmin "${username}" ready — /platform/login`);
}

async function main() {
  const cafe = await seedCafe();
  console.log(`
✅ Seed complete!

Cafe:    Mittho Cafe
Login:   /c/mittho-cafe/login

Staff PINs:
  Admin  → 9999
  Sita   → 1111
  Ram    → 2222
  Gita   → 3333

Tables:  T1–T7 (2–6 pax) + Bar-1, Bar-2, Bar-3
Menu:    6 categories, 37 items with modifiers
`);
  await seedPlatformUser();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
