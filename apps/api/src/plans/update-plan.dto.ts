import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40)
  name?: string;

  @IsOptional() @IsString() @MaxLength(200)
  description?: string | null;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  monthlyPrice?: number;

  // Months charged for a yearly plan (10 = "pay 10, get 12").
  @IsOptional() @IsInt() @Min(1) @Max(12)
  yearlyMonths?: number;

  // null = unlimited
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0)
  maxStaff?: number | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0)
  maxMenuItems?: number | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0)
  maxTables?: number | null;

  @IsOptional() @IsBoolean() qrOrdering?: boolean;
  @IsOptional() @IsBoolean() reports?: boolean;
  @IsOptional() @IsBoolean() inventory?: boolean;
  @IsOptional() @IsBoolean() tableGame?: boolean;
}
