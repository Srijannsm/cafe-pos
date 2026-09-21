import { IsBoolean } from 'class-validator';

export class UpdateCafeDto {
  @IsBoolean()
  isActive: boolean;
}
