import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsISO8601, IsNotEmpty,
  IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { StockKind } from '../../generated/prisma/client.js';

export const STOCK_UNITS = ['pcs', 'g', 'kg', 'ml', 'L', 'pack', 'box', 'bottle', 'dozen'] as const;

export class CreateStockItemDto {
  @IsString() @IsNotEmpty() @MaxLength(60)
  name: string;

  @IsEnum(StockKind)
  kind: StockKind;

  @IsIn(STOCK_UNITS)
  unit: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  lowStockThreshold?: number;

  // Opening balance -- recorded as an 'opening' movement, not just a number.
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  openingQty?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  unitCost?: number;
}

export class UpdateStockItemDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(60)
  name?: string;

  @IsOptional() @IsEnum(StockKind)
  kind?: StockKind;

  @IsOptional() @IsIn(STOCK_UNITS)
  unit?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  lowStockThreshold?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

// Stock leaving for a reason other than a sale.
export class StockOutDto {
  @IsInt()
  stockItemId: number;

  @IsIn(['wastage', 'breakage', 'staff_use'])
  type: 'wastage' | 'breakage' | 'staff_use';

  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001)
  quantity: number;

  @IsOptional() @IsString() @MaxLength(200)
  reason?: string;
}

export class PurchaseLineDto {
  @IsInt()
  stockItemId: number;

  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001)
  quantity: number;

  // Total paid for this line; unit cost is derived (that's how bills read).
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  lineTotal: number;
}

export class CreatePurchaseDto {
  @IsOptional() @IsInt()
  supplierId?: number;

  @IsOptional() @IsString() @MaxLength(60)
  supplierName?: string; // quick-add a supplier inline

  @IsOptional() @IsISO8601({ strict: false })
  purchasedAt?: string;

  @IsOptional() @IsString() @MaxLength(60)
  billRef?: string;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => PurchaseLineDto)
  lines: PurchaseLineDto[];
}

export class CountLineDto {
  @IsInt()
  stockItemId: number;

  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  countedQty: number;
}

export class StockCountDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => CountLineDto)
  lines: CountLineDto[];

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class SupplierDto {
  @IsString() @IsNotEmpty() @MaxLength(60)
  name: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(20)
  panNumber?: string;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class MovementsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt()
  stockItemId?: number;

  @IsOptional() @IsISO8601({ strict: false })
  from?: string;

  @IsOptional() @IsISO8601({ strict: false })
  to?: string;
}
