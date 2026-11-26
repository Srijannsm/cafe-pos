import { IsOptional, IsIn, IsNotEmpty, IsString, Length, Matches, ValidateIf } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin: string;

  @IsIn(['admin', 'cashier', 'waiter'])
  role: 'admin' | 'cashier' | 'waiter';

  // Must be a file we stored via POST /uploads/image/staff; null removes it.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(/^\/uploads\/staff\/[\w.-]+$/, { message: 'avatarUrl must be an uploaded staff photo' })
  avatarUrl?: string | null;
}
