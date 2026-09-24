-- Baseline: mergedIntoId was added directly to the DB outside migration history.
ALTER TABLE "restaurant_tables" ADD COLUMN "mergedIntoId" INTEGER;
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
