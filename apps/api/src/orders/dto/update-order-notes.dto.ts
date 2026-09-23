import { IsOptional, IsString } from 'class-validator';

export class UpdateOrderNotesDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
