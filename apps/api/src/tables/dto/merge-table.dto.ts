import { IsInt, IsPositive } from 'class-validator';

export class MergeTableDto {
  @IsInt()
  @IsPositive()
  secondaryTableId: number;
}
