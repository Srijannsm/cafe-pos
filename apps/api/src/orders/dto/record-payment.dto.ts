import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';

export class RecordPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}

// One payment towards a bill. A bill can take several (split / mixed
// tender); it closes automatically once the payments cover the total.
export class AddPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;
}
