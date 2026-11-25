import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, Min, ValidateNested } from 'class-validator';

// Drag-to-reorder sends the full new order in one request rather than one
// PATCH per row, so the list can never end up half-saved.
export class ReorderDto {
  @IsIn(['category', 'item'])
  kind: 'category' | 'item';

  @IsArray()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids: number[];
}

export class RecipeLineDto {
  @IsInt()
  stockItemId: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;
}

export class SetRecipeDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines: RecipeLineDto[];
}
