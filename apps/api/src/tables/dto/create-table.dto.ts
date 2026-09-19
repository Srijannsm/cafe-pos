import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class CreateTableDto {
  @IsString()
  @IsNotEmpty()
  tableNumber: string;

  @IsInt()
  @IsPositive()
  capacity: number;
}
