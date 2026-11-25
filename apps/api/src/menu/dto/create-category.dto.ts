import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  // Optional -- new categories go to the end if omitted.
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  // Set to make this a sub-category of another (top-level) category.
  @IsOptional()
  @IsInt()
  parentId?: number | null;
}
