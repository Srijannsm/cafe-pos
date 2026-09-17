import { IsEnum } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';

export class RecordPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}