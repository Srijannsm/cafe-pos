import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateCafeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // Lowercase letters, numbers, and single hyphens between words -- this is
  // what shows up in the login URL (/c/:slug/login), so it needs to be
  // URL-safe and unambiguous, not just unique.
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens only (e.g. "mittho-cafe")',
  })
  slug: string;

  @IsString()
  @IsNotEmpty()
  adminName: string;

  @IsString()
  @Length(4, 4)
  adminPin: string;

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
}
