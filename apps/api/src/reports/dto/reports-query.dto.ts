import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

export type GroupBy = 'day' | 'week' | 'month' | 'year';

export class ReportsQueryDto {
  @IsOptional()
  @IsISO8601({ strict: false })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: false })
  to?: string;

  @IsOptional()
  @IsEnum(['day', 'week', 'month', 'year'])
  groupBy?: GroupBy;
}
