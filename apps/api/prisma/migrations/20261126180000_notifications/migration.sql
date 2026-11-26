-- Staff notifications (QR order, waiter call, bill request, food ready,
-- recall, sent to kitchen, void). Stored so a screen that was closed,
-- asleep or on another page catches up when it opens again.
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" SERIAL NOT NULL,
    "cafeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" INTEGER,
    "tableNumber" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_cafeId_createdAt_idx" ON "notifications"("cafeId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_cafeId_fkey"
    FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
