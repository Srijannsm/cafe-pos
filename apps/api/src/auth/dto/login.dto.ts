import { IsInt, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsInt()
  userId: number;

  @IsString()
  @Length(4, 4)
  pin: string;
}