/*
  Warnings:

  - You are about to drop the column `pan_number` on the `cafes` table. All the data in the column will be lost.
  - You are about to drop the column `vat_enabled` on the `cafes` table. All the data in the column will be lost.
  - You are about to drop the column `vat_rate` on the `cafes` table. All the data in the column will be lost.
  - You are about to drop the column `vat_amount` on the `orders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "cafes" DROP COLUMN "pan_number",
DROP COLUMN "vat_enabled",
DROP COLUMN "vat_rate",
ADD COLUMN     "panNumber" TEXT,
ADD COLUMN     "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatRate" DECIMAL(65,30) NOT NULL DEFAULT 13;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "vat_amount",
ADD COLUMN     "vatAmount" DECIMAL(65,30);
