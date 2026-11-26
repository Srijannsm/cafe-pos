import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class KitchenQueryDto {
  @IsOptional() @IsIn(['kitchen', 'bar', 'hookah'])
  station?: 'kitchen' | 'bar' | 'hookah';

  /** Minutes east of UTC, for "today" in the stats. Defaults to Nepal. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(-720) @Max(840)
  tz?: number;
}

export class MarkReadyDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @IsInt({ each: true })
  ids: number[];
}
