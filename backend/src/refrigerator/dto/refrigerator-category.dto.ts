import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateRefrigeratorCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  cafeId?: string;
}

export class UpdateRefrigeratorCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
