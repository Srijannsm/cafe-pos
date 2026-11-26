import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

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
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin?: string;

  // Must be a file we stored via POST /uploads/image/staff; null removes it.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(/^\/uploads\/staff\/[\w.-]+$/, { message: 'avatarUrl must be an uploaded staff photo' })
  avatarUrl?: string | null;
}
