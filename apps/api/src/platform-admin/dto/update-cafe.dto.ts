import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // VAT
  @IsOptional()
  @IsBoolean()
  vatEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsString()
  panNumber?: string | null;

  // Logo
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  // Subscription
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsString()
  billingCycle?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsString()
  nextBillingAt?: string | null; // ISO date string

  @IsOptional()
  @IsBoolean()
  setupFeePaid?: boolean;

  @IsOptional()
  @IsString()
  subscriptionNotes?: string | null;
}
