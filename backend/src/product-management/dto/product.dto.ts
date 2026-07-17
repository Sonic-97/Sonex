import { IsString, IsNumber, IsOptional, IsBoolean, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  recipe?: RecipeIngredientDto[];
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cafePrice?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  cafeId?: string;

  @IsOptional()
  @IsBoolean()
  isRefrigerated?: boolean;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsNumber()
  refrigeratorStock?: number;

  @IsOptional()
  @IsNumber()
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  refrigeratorCategoryId?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  recipe?: RecipeIngredientDto[];
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cafePrice?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  isRefrigerated?: boolean;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsNumber()
  refrigeratorStock?: number;

  @IsOptional()
  @IsNumber()
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  refrigeratorCategoryId?: string;
}


export class RecipeIngredientDto {
  @IsString()
  inventoryId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wastePercent?: number;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ProductSizeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsNumber()
  priceAdjust?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPercent?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AddOnIngredientDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  inventoryId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class PackagingMaterialDto {
  @IsString()
  name: string;

  @IsString()
  inventoryId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class OptionChoiceDto {
  @IsString()
  label: string;

  @IsOptional()
  @IsNumber()
  priceAdjust?: number;

  @IsOptional()
  @IsArray()
  ingredientImpacts?: Array<{ inventoryId: string; quantity: number }>;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class ProductOptionDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  multiSelect?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionChoiceDto)
  choices: OptionChoiceDto[];

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  cafeId?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PriceChangeDto {
  @IsNumber()
  @Min(0)
  oldPrice: number;

  @IsNumber()
  @Min(0)
  newPrice: number;

  @IsOptional()
  @IsNumber()
  oldCost?: number;

  @IsOptional()
  @IsNumber()
  newCost?: number;

  @IsOptional()
  @IsString()
  changedById?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateRefrigeratorCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  emoji?: string;

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
