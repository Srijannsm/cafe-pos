import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { OrderSource, OrderType, PaymentMethod } from '../../generated/prisma/client.js';

export type GroupBy = 'day' | 'week' | 'month';

// One filter shape shared by every report, so the filter bar on the web is
// the same everywhere and a report link can be bookmarked/shared as a URL.
export class ReportsQueryDto {
  @IsOptional() @IsISO8601({ strict: false })
  from?: string; // YYYY-MM-DD (cafe-local calendar day)

  @IsOptional() @IsISO8601({ strict: false })
  to?: string;

  @IsOptional() @IsIn(['day', 'week', 'month'])
  groupBy?: GroupBy;

  @IsOptional() @Type(() => Number) @IsInt()
  staffId?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  categoryId?: number;

  @IsOptional() @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional() @IsEnum(OrderSource)
  source?: OrderSource;

  @IsOptional() @IsEnum(OrderType)
  orderType?: OrderType;

  // Minutes east of UTC. Defaults to Nepal (+5:45) so "today" means the
  // cafe's today, not London's.
  @IsOptional() @Type(() => Number) @IsInt() @Min(-720) @Max(840)
  tz?: number;
}
