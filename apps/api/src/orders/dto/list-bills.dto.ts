import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Filters for the admin "Bills" page. Deliberately separate from the Reports
// filters: looking up a bill is day-to-day work (reprint, check a payment,
// answer a customer) and must work on every plan, not just plans with Reports.
export class ListBillsDto {
  /** Bill number, order number, or table number. */
  @IsOptional() @IsString() @MaxLength(40)
  q?: string;

  @IsOptional() @IsIn(['all', 'unpaid', 'paid', 'cancelled'])
  status?: 'all' | 'unpaid' | 'paid' | 'cancelled';

  /** YYYY-MM-DD, cafe-local day (inclusive). */
  @IsOptional() @IsISO8601({ strict: false })
  from?: string;

  @IsOptional() @IsISO8601({ strict: false })
  to?: string;

  /** Minutes east of UTC; defaults to Nepal (+5:45). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(-720) @Max(840)
  tz?: number;

  /** Keyset pagination: return bills with id below this. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  before?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  take?: number;
}
