-- Kitchen display: when each item was sent to the kitchen / marked ready.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3);
-- Items already in the kitchen: best guess is when they were added.
UPDATE "order_items" SET "sentAt" = "createdAt" WHERE "sentToKitchen" = true AND "sentAt" IS NULL;
CREATE INDEX IF NOT EXISTS "order_items_readyAt_idx" ON "order_items"("readyAt");
