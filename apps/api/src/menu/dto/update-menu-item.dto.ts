import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsPositive, IsString, Matches, MaxLength, Min,
} from 'class-validator';
import { Station } from '../../generated/prisma/client.js';
import { MENU_TAGS } from './menu-fields.js';

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  // Path returned by POST /uploads/image/menu -- never an arbitrary URL.
  @IsOptional()
  @IsString()
  @Matches(/^\/uploads\/menu\/[\w.-]+$/)
  imageUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(MENU_TAGS, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(Station)
  station?: Station;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number | null;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}
