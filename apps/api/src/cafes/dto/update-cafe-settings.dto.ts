import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';

export class UpdateCafeSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'themeColor must be a valid hex color, e.g. #e85d26' })
  themeColor?: string;
}
