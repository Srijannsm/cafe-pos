-- AlterTable
-- Fixed: originally targeted "Cafe", but the table is mapped to "cafes" (@@map).
-- IF NOT EXISTS because some dev DBs got this column via `prisma db push`.
ALTER TABLE "cafes" ADD COLUMN IF NOT EXISTS "themeColor" TEXT;
