import { IsNotEmpty, IsString } from 'class-validator';

export class PlatformLoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
