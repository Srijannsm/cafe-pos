-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_waiterId_fkey";

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
