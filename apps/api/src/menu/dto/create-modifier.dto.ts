import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateModifierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  priceDelta: number;
}
