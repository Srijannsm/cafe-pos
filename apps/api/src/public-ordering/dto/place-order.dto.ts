import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class PlaceOrderItemDto {
  @IsInt()
  menuItemId: number;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity: number;

  @IsOptional()
  @IsInt({ each: true })
  modifierIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(150)
  note?: string;
}

export class PlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => PlaceOrderItemDto)
  items: PlaceOrderItemDto[];
}

export class TableRequestDto {
  @IsIn(['call_waiter', 'request_bill'])
  type: 'call_waiter' | 'request_bill';
}
