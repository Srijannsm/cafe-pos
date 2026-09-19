import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class UpdateTableDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tableNumber?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  capacity?: number;
}
