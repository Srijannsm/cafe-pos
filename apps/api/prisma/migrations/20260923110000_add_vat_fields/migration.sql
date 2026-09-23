-- AlterTable: add VAT opt-in fields to cafes
ALTER TABLE "cafes" ADD COLUMN "vat_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cafes" ADD COLUMN "vat_rate" DECIMAL(65,30) NOT NULL DEFAULT 13;
ALTER TABLE "cafes" ADD COLUMN "pan_number" TEXT;

-- AlterTable: add subtotal / vatAmount to orders (nullable -- only set for VAT cafes)
ALTER TABLE "orders" ADD COLUMN "subtotal" DECIMAL(65,30);
ALTER TABLE "orders" ADD COLUMN "vat_amount" DECIMAL(65,30);
