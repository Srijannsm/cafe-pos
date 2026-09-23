-- AlterTable
ALTER TABLE "cafes" ADD COLUMN     "lastBillNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billNumber" INTEGER;
