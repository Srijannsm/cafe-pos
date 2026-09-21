import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';

export class PlaceOrderItemDto {
  @IsInt()
  menuItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsInt({ each: true })
  modifierIds?: number[];
}

export class PlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlaceOrderItemDto)
  items: PlaceOrderItemDto[];
}
