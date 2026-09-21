import { IsInt, Max, Min } from 'class-validator';

export class AdjustStockDto {
  // Positive to restock, negative to correct for waste/breakage. Applied
  // atomically against the current stockQuantity server-side (not a
  // read-then-write from the client), so two people restocking the same
  // item at once still both count.
  @IsInt()
  @Min(-100000)
  @Max(100000)
  delta: number;
}
