import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(['admin', 'cashier', 'waiter'])
  role?: 'admin' | 'cashier' | 'waiter';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Resets the PIN when provided; omit to leave the PIN unchanged.
  @IsOptional()
  @IsString()
  @Length(4, 4)
  pin?: string;
}
