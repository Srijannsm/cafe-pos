import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCancelRequestDto {
  @IsInt()
  orderId: number;

  @IsString() @MinLength(2) @MaxLength(200)
  reason: string;
}
