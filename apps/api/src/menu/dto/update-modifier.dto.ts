import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateModifierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumber()
  priceDelta?: number;
}
