import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsInt()
  categoryId: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
