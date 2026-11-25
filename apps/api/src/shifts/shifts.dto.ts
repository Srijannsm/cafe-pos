import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CashMovementType } from '../generated/prisma/client.js';

export class OpenShiftDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  openingCash: number;
}

export class CloseShiftDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  countedCash: number;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class CashMovementDto {
  @IsEnum(CashMovementType)
  type: CashMovementType;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  amount: number;

  @IsOptional() @IsString() @MaxLength(40)
  category?: string;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class ListQueryDto {
  @IsOptional() @IsISO8601({ strict: false })
  from?: string;

  @IsOptional() @IsISO8601({ strict: false })
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  take?: number;
}
