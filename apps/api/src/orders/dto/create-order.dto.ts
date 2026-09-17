import { IsEnum, IsInt } from 'class-validator';
import { OrderType } from '../../generated/prisma/client.js';

export class CreateOrderDto {
  @IsInt()
  tableId: number;

  @IsInt()
  waiterId: number;

  @IsEnum(OrderType)
  orderType: OrderType;
}
