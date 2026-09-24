-- Migration: add physical table merge support
-- Run this manually: cd apps/api && npx prisma migrate deploy
-- OR apply directly: psql $DATABASE_URL -f this_file.sql

ALTER TABLE "restaurant_tables"
  ADD COLUMN IF NOT EXISTS "mergedIntoId" INTEGER
  REFERENCES "restaurant_tables"(id) ON DELETE SET NULL;
