import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DiscountType } from '../../generated/prisma/client.js';

export class ApplyDiscountDto {
  @IsEnum(DiscountType)
  type: DiscountType;

  // percent: 0-100, flat: rupees. 0 removes the discount.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  reason: string;
}

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;
}

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
