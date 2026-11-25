-- Plans become data instead of code: the superadmin edits price, limits and
-- features per plan in /platform/plans. Seeded with the values that used to
-- be hardcoded in subscription/plan-limits.ts (plus the two new feature
-- flags: inventory on Standard+, table game on Premium).
CREATE TABLE "plan_configs" (
  "id" SERIAL NOT NULL,
  "key" "subscription_plan" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "monthlyPrice" DECIMAL(65,30) NOT NULL,
  "yearlyMonths" INTEGER NOT NULL DEFAULT 10,
  "maxStaff" INTEGER,
  "maxMenuItems" INTEGER,
  "maxTables" INTEGER,
  "qrOrdering" BOOLEAN NOT NULL DEFAULT false,
  "reports" BOOLEAN NOT NULL DEFAULT false,
  "inventory" BOOLEAN NOT NULL DEFAULT false,
  "tableGame" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plan_configs_key_key" ON "plan_configs"("key");

INSERT INTO "plan_configs" ("key", "name", "description", "monthlyPrice", "maxStaff", "maxMenuItems", "maxTables", "qrOrdering", "reports", "inventory", "tableGame") VALUES
  ('starter',  'Starter',  'Waiter app, kitchen display and billing for a small cafe.', 999,  3,    20,   10,   false, false, false, false),
  ('standard', 'Standard', 'Adds QR self-ordering, reports and inventory.',             1999, 10,   100,  30,   true,  true,  true,  false),
  ('premium',  'Premium',  'Everything, unlimited — plus the customer table game.',      3499, NULL, NULL, NULL, true,  true,  true,  true);
