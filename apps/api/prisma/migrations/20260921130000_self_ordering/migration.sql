-- AlterTable: give every existing table an unguessable per-table token
-- before the column is made NOT NULL + unique.
ALTER TABLE "restaurant_tables" ADD COLUMN "qrToken" TEXT;

UPDATE "restaurant_tables"
SET "qrToken" = md5(random()::text || clock_timestamp()::text || "id"::text)
WHERE "qrToken" IS NULL;

ALTER TABLE "restaurant_tables" ALTER COLUMN "qrToken" SET NOT NULL;

CREATE UNIQUE INDEX "restaurant_tables_qrToken_key" ON "restaurant_tables"("qrToken");

-- AlterTable: waiterId becomes optional -- a customer self-placed order
-- has no waiter to attribute it to.
ALTER TABLE "orders" ALTER COLUMN "waiterId" DROP NOT NULL;
