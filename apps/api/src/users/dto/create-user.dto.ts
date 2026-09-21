import { IsIn, IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Length(4, 4)
  pin: string;

  @IsIn(['admin', 'cashier', 'waiter'])
  role: 'admin' | 'cashier' | 'waiter';
}
