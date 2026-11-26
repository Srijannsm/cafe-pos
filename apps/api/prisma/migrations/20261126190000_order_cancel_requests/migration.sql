-- Kitchen/waiter asks to cancel an order the kitchen already has; an admin
-- approves (order is cancelled) or declines (kitchen carries on).
CREATE TABLE IF NOT EXISTS "order_cancel_requests" (
    "id" SERIAL NOT NULL,
    "cafeId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" INTEGER,
    "requestedBy" TEXT NOT NULL,
    "decidedById" INTEGER,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_cancel_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "order_cancel_requests_cafeId_status_idx" ON "order_cancel_requests"("cafeId", "status");
CREATE INDEX IF NOT EXISTS "order_cancel_requests_orderId_status_idx" ON "order_cancel_requests"("orderId", "status");
DO $$ BEGIN
  ALTER TABLE "order_cancel_requests" ADD CONSTRAINT "order_cancel_requests_cafeId_fkey"
    FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_cancel_requests" ADD CONSTRAINT "order_cancel_requests_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
