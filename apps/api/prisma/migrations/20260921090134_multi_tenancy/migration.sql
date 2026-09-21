-- Multi-tenancy: introduce the Cafe (tenant) model and scope every existing
-- table to it. Written by hand rather than by `prisma migrate dev` because
-- adding required (NOT NULL) columns to tables that already have rows needs
-- a backfill step Prisma can't infer automatically -- so this creates the
-- columns nullable first, backfills them to the one existing cafe, then
-- tightens to NOT NULL + adds the foreign keys.

-- CreateTable
CREATE TABLE "cafes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cafes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cafes_slug_key" ON "cafes"("slug");

-- Seed the one cafe that owns all data created before multi-tenancy existed
INSERT INTO "cafes" ("name", "slug") VALUES ('Mittho Cafe', 'mittho-cafe');

-- AlterTable: add cafeId nullable first so this doesn't fail against
-- existing rows
ALTER TABLE "users" ADD COLUMN "cafeId" INTEGER;
ALTER TABLE "restaurant_tables" ADD COLUMN "cafeId" INTEGER;
ALTER TABLE "menu_categories" ADD COLUMN "cafeId" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN "cafeId" INTEGER;
ALTER TABLE "orders" ADD COLUMN "cafeId" INTEGER;

-- Backfill: every row that existed before multi-tenancy belongs to the one
-- cafe this deployment was originally built for
UPDATE "users" SET "cafeId" = (SELECT "id" FROM "cafes" WHERE "slug" = 'mittho-cafe');
UPDATE "restaurant_tables" SET "cafeId" = (SELECT "id" FROM "cafes" WHERE "slug" = 'mittho-cafe');
UPDATE "menu_categories" SET "cafeId" = (SELECT "id" FROM "cafes" WHERE "slug" = 'mittho-cafe');
UPDATE "menu_items" SET "cafeId" = (SELECT "id" FROM "cafes" WHERE "slug" = 'mittho-cafe');
UPDATE "orders" SET "cafeId" = (SELECT "id" FROM "cafes" WHERE "slug" = 'mittho-cafe');

-- AlterTable: now that every row has a cafeId, make it required
ALTER TABLE "users" ALTER COLUMN "cafeId" SET NOT NULL;
ALTER TABLE "restaurant_tables" ALTER COLUMN "cafeId" SET NOT NULL;
ALTER TABLE "menu_categories" ALTER COLUMN "cafeId" SET NOT NULL;
ALTER TABLE "menu_items" ALTER COLUMN "cafeId" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "cafeId" SET NOT NULL;

-- DropIndex: uniqueness was global (one name across all cafes) -- replaced
-- below with per-cafe uniqueness
DROP INDEX "users_name_key";
DROP INDEX "menu_categories_name_key";
DROP INDEX "menu_items_name_key";

-- CreateIndex: per-cafe uniqueness
CREATE UNIQUE INDEX "users_cafeId_name_key" ON "users"("cafeId", "name");
CREATE UNIQUE INDEX "restaurant_tables_cafeId_tableNumber_key" ON "restaurant_tables"("cafeId", "tableNumber");
CREATE UNIQUE INDEX "menu_categories_cafeId_name_key" ON "menu_categories"("cafeId", "name");
CREATE UNIQUE INDEX "menu_items_cafeId_name_key" ON "menu_items"("cafeId", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
