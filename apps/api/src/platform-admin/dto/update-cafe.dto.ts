import { IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

export enum SubscriptionPlan {
  starter = 'starter',
  standard = 'standard',
  premium = 'premium',
}

export enum SubscriptionStatus {
  trial = 'trial',
  active = 'active',
  overdue = 'overdue',
  cancelled = 'cancelled',
}

export class UpdateCafeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  // VAT
  @IsOptional() @IsBoolean()
  vatEnabled?: boolean;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  vatRate?: number;

  @IsOptional() @IsString()
  panNumber?: string | null;

  // Logo
  @IsOptional() @IsString()
  logoUrl?: string | null;

  // Features
  @IsOptional() @IsBoolean()
  inventoryEnabled?: boolean;

  @IsOptional() @IsBoolean()
  gamesEnabled?: boolean;

  // Subscription
  @IsOptional() @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional() @IsIn(['monthly', 'yearly'])
  billingCycle?: string;

  @IsOptional() @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional() @IsString()
  nextBillingAt?: string | null; // ISO date string

  @IsOptional() @IsBoolean()
  setupFeePaid?: boolean;

  @IsOptional() @IsString() @MaxLength(4000)
  subscriptionNotes?: string | null;
}

// "They paid": activates the subscription, moves the next billing date one
// cycle forward and appends a dated line to the notes -- a lightweight
// payment log until there's a real billing table.
export class RecordSubscriptionPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  amount: number;

  @IsString() @IsNotEmpty() @MaxLength(40)
  method: string; // eSewa, Khalti, bank transfer, cash

  @IsOptional() @IsString() @MaxLength(80)
  reference?: string;
}

export class ExtendTrialDto {
  @IsInt() @Min(1) @Max(60)
  days: number;
}

export class ResetPinDto {
  @IsString() @Length(4, 4) @Matches(/^\d{4}$/)
  pin: string;
}
