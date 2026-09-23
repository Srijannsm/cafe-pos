import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { OrderType } from '../../generated/prisma/client.js';

export class CreateOrderDto {
  @IsInt()
  tableId: number;

  @IsInt()
  waiterId: number;

  @IsEnum(OrderType)
  orderType: OrderType;

  @IsOptional()
  @IsString()
  notes?: string;
}
