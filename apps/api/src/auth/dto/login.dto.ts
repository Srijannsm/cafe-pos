import { IsInt, IsNotEmpty, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  cafeSlug: string;

  @IsInt()
  userId: number;

  @IsString()
  @Length(4, 4)
  pin: string;
}
