import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdateCafeSettingsDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'themeColor must be a valid hex color, e.g. #e85d26' })
  themeColor?: string;

  // ── Branding / vibe ──
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @Matches(/^\/uploads\/cover\/[\w.-]+$/)
  coverImageUrl?: string | null;

  @IsOptional() @IsString() @MaxLength(120)
  tagline?: string;

  @IsOptional() @IsIn(['modern', 'warm', 'playful'])
  fontStyle?: string;

  @IsOptional() @IsIn(['grid', 'list'])
  menuLayout?: string;

  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) address?: string;
  @IsOptional() @IsString() @MaxLength(60) wifiName?: string;
  @IsOptional() @IsString() @MaxLength(60) wifiPassword?: string;
  @IsOptional() @IsString() @MaxLength(80) instagram?: string;
  @IsOptional() @IsString() @MaxLength(80) facebook?: string;
  @IsOptional() @IsString() @MaxLength(80) tiktok?: string;
  @IsOptional() @IsString() @MaxLength(160) receiptFooter?: string;

  // ── Billing ──
  @IsOptional() @IsBoolean() vatEnabled?: boolean;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(30)
  vatRate?: number;

  @IsOptional() @IsString() @MaxLength(20)
  panNumber?: string;

  @IsOptional() @IsBoolean() pricesIncludeVat?: boolean;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(20)
  serviceChargeRate?: number;

  // ── Features ──
  @IsOptional() @IsBoolean() inventoryEnabled?: boolean;
  @IsOptional() @IsBoolean() gamesEnabled?: boolean;
}
