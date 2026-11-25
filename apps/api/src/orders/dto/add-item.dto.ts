import { IsOptional, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class AddOrderDto {
  @IsInt()
  menuItemId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsInt({ each: true })
  modifierIds?: number[];

  // Per-line kitchen note ("less sugar", "no onion"). Capped so a ticket
  // stays readable on a small kitchen screen.
  @IsOptional()
  @IsString()
  @MaxLength(150)
  note?: string;
}
