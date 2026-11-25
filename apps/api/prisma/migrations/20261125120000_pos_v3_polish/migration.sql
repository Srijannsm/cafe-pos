-- POS v3 polish: sub-categories, item photos/description/tags/station,
-- branding, discounts & voids, multi-payment, cash drawer shifts,
-- inventory (stock items, suppliers, purchases, movements, recipes),
-- audit log and QR table requests. Purely additive -- no existing column
-- is dropped or changed, so existing data keeps working.

-- Enums
CREATE TYPE "Station" AS ENUM ('kitchen', 'bar', 'hookah');
CREATE TYPE "OrderSource" AS ENUM ('staff', 'qr');
CREATE TYPE "DiscountType" AS ENUM ('percent', 'flat');
CREATE TYPE "CashMovementType" AS ENUM ('pay_in', 'pay_out', 'expense');
CREATE TYPE "StockKind" AS ENUM ('ingredient', 'consumable', 'asset');
CREATE TYPE "StockMovementType" AS ENUM ('opening', 'purchase', 'sale', 'wastage', 'breakage', 'staff_use', 'adjustment', 'count');
CREATE TYPE "TableRequestType" AS ENUM ('call_waiter', 'request_bill');

-- Cafe: branding + billing behaviour + feature toggles
ALTER TABLE "cafes"
  ADD COLUMN "coverImageUrl" TEXT,
  ADD COLUMN "tagline" TEXT,
  ADD COLUMN "fontStyle" TEXT NOT NULL DEFAULT 'modern',
  ADD COLUMN "menuLayout" TEXT NOT NULL DEFAULT 'grid',
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "wifiName" TEXT,
  ADD COLUMN "wifiPassword" TEXT,
  ADD COLUMN "instagram" TEXT,
  ADD COLUMN "facebook" TEXT,
  ADD COLUMN "tiktok" TEXT,
  ADD COLUMN "receiptFooter" TEXT,
  ADD COLUMN "serviceChargeRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inventoryEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "gamesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Menu categories: sub-categories + active flag
ALTER TABLE "menu_categories"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "parentId" INTEGER;
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "menu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Menu items
ALTER TABLE "menu_items"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "station" "Station" NOT NULL DEFAULT 'kitchen',
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "costPrice" DECIMAL(65,30);

-- Orders: source, discount, service charge, print count, cancel reason
ALTER TABLE "orders"
  ADD COLUMN "source" "OrderSource" NOT NULL DEFAULT 'staff',
  ADD COLUMN "discountType" "DiscountType",
  ADD COLUMN "discountValue" DECIMAL(65,30),
  ADD COLUMN "discountAmount" DECIMAL(65,30),
  ADD COLUMN "discountReason" TEXT,
  ADD COLUMN "serviceCharge" DECIMAL(65,30),
  ADD COLUMN "printCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cancelReason" TEXT;
-- Orders placed by customers before this migration had no waiter
UPDATE "orders" SET "source" = 'qr' WHERE "waiterId" IS NULL;

-- Order items: note, station snapshot, timestamps, voids
ALTER TABLE "order_items"
  ADD COLUMN "note" TEXT,
  ADD COLUMN "station" "Station" NOT NULL DEFAULT 'kitchen',
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "voidedById" INTEGER;

-- Shifts (cash drawer)
CREATE TABLE "shifts" (
  "id" SERIAL NOT NULL,
  "cafeId" INTEGER NOT NULL,
  "openedById" INTEGER NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingCash" DECIMAL(65,30) NOT NULL,
  "closedById" INTEGER,
  "closedAt" TIMESTAMP(3),
  "expectedCash" DECIMAL(65,30),
  "countedCash" DECIMAL(65,30),
  "difference" DECIMAL(65,30),
  "note" TEXT,
  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shifts_cafeId_closedAt_idx" ON "shifts"("cafeId", "closedAt");
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Payments: many per bill, linked to a shift
ALTER TABLE "payments"
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "receivedById" INTEGER,
  ADD COLUMN "shiftId" INTEGER;
ALTER TABLE "payments" ADD CONSTRAINT "payments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cash movements (pay in / pay out / expense)
CREATE TABLE "cash_movements" (
  "id" SERIAL NOT NULL,
  "cafeId" INTEGER NOT NULL,
  "shiftId" INTEGER,
  "type" "CashMovementType" NOT NULL,
  "category" TEXT,
  "amount" DECIMAL(65,30) NOT NULL,
  "note" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cash_movements_cafeId_createdAt_idx" ON "cash_movements"("cafeId", "createdAt");
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Inventory
CREATE TABLE "stock_items" (
  "id" SERIAL NOT NULL,
  "cafeId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "StockKind" NOT NULL DEFAULT 'ingredient',
  "unit" TEXT NOT NULL,
  "currentQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "avgCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "lowStockThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_items_cafeId_name_key" ON "stock_items"("cafeId", "name");
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "suppliers" (
  "id" SERIAL NOT NULL,
  "cafeId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "panNumber" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "suppliers_cafeId_name_key" ON "suppliers"("cafeId", "name");
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "purchases" (
  "id" SERIAL NOT NULL,
  "cafeId" INTEGER NOT NULL,
  "supplierId" INTEGER,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "billRef" TEXT,
  "total" DECIMAL(65,30) NOT NULL,
  "note" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "purchases_cafeId_purchasedAt_idx" ON "purchases"("cafeId", "purchasedAt");
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "purchase_lines" (
  "id" SERIAL NOT NULL,
  "purchaseId" INTEGER NOT NULL,
  "stockItemId" INTEGER NOT NULL,
  "quantity" DECIMAL(65,30) NOT NULL,
  "unitCost" DECIMAL(65,30) NOT NULL,
  "lineTotal" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "stock_movements" (
  "id" SERIAL NOT NULL,
  "cafeId" INTEGER NOT NULL,
  "stockItemId" INTEGER NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(65,30) NOT NULL,
  "unitCost" DECIMAL(65,30),
  "reason" TEXT,
  "refType" TEXT,
  "refId" INTEGER,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_movements_cafeId_createdAt_idx" ON "stock_movements"("cafeId", "createdAt");
CREATE INDEX "stock_movements_stockItemId_createdAt_idx" ON "stock_movements"("stockItemId", "createdAt");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "recipe_lines" (
  "id" SERIAL NOT NULL,
  "menuItemId" INTEGER NOT NULL,
  "stockItemId" INTEGER NOT NULL,
  "quantity" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "recipe_lines_menuItemId_stockItemId_key" ON "recipe_lines"("menuItemId", "stockItemId");
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit log
CREATE TABLE "audit_logs" (
  "id" SERIAL NOT NULL,
  "cafeId" INTEGER NOT NULL,
  "actorId" INTEGER,
  "actorName" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" INTEGER,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_cafeId_createdAt_idx" ON "audit_logs"("cafeId", "createdAt");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Table requests (call waiter / request bill)
CREATE TABLE "table_requests" (
  "id" SERIAL NOT NULL,
  "cafeId" INTEGER NOT NULL,
  "tableId" INTEGER NOT NULL,
  "type" "TableRequestType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" INTEGER,
  CONSTRAINT "table_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "table_requests_cafeId_resolvedAt_idx" ON "table_requests"("cafeId", "resolvedAt");
ALTER TABLE "table_requests" ADD CONSTRAINT "table_requests_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "cafes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_requests" ADD CONSTRAINT "table_requests_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
