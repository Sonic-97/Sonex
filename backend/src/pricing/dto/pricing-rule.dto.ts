import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsArray, Min, Max } from 'class-validator';
import { DynamicPricingRuleType } from '@prisma/client';

export class CreatePricingRuleDto {
  @IsString()
  name: string;

  @IsEnum(DynamicPricingRuleType)
  ruleType: DynamicPricingRuleType;

  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  conditions?: any;

  @IsOptional()
  @IsArray()
  productIds?: string[];

  @IsOptional()
  @IsArray()
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;
}

export class UpdatePricingRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DynamicPricingRuleType)
  ruleType?: DynamicPricingRuleType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  conditions?: any;

  @IsOptional()
  @IsArray()
  productIds?: string[];

  @IsOptional()
  @IsArray()
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;
}

export class PreviewPriceDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
