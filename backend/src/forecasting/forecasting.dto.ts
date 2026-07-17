import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ForecastType } from './forecasting.types';

const FORECAST_TYPES: ForecastType[] = [
  'DAILY_SALES_FORECAST', 'DAILY_ORDER_COUNT_FORECAST', 'HOURLY_ORDER_FORECAST',
  'PRODUCT_DEMAND_FORECAST', 'CATEGORY_DEMAND_FORECAST', 'BRANCH_DEMAND_FORECAST',
  'INGREDIENT_CONSUMPTION_FORECAST', 'STOCK_DEPLETION_ESTIMATE', 'STOCKOUT_RISK',
  'STAFFING_DEMAND_ESTIMATE', 'WASTE_RISK_ESTIMATE', 'CUSTOMER_RETURN_FORECAST',
];

export class ForecastRequestDto {
  @IsIn(FORECAST_TYPES) type!: ForecastType;
  @IsOptional() @IsString() @MaxLength(80) entityId?: string;
  @IsOptional() @IsString() @MaxLength(80) branchId?: string;
  @IsOptional() @IsString() @MaxLength(10) from?: string;
  @IsOptional() @IsString() @MaxLength(10) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31) horizonDays?: number;
}

export class SimulationRequestDto {
  @IsIn(['OFFER_IMPACT_SIMULATION', 'DISCOUNT_IMPACT_SIMULATION', 'COMBO_IMPACT_SIMULATION', 'PRICE_CHANGE_SIMULATION', 'CAPACITY_IMPACT_SIMULATION']) type!: ForecastType;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @IsString({ each: true }) productIds!: string[];
  @IsOptional() @IsString() @MaxLength(80) branchId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) @Max(99) discountValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.01) @Max(1000000) proposedPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) maxRedemptions?: number;
  @IsOptional() @IsString() @MaxLength(10) from?: string;
  @IsOptional() @IsString() @MaxLength(10) to?: string;
}

export class ForecastFeedbackDto {
  @IsString() @MaxLength(80) resultId!: string;
  @IsIn(['ACCURATE', 'HIGHER_THAN_ACTUAL', 'LOWER_THAN_ACTUAL', 'USEFUL_SIMULATION', 'UNREALISTIC_ASSUMPTIONS'])
  feedback!: 'ACCURATE' | 'HIGHER_THAN_ACTUAL' | 'LOWER_THAN_ACTUAL' | 'USEFUL_SIMULATION' | 'UNREALISTIC_ASSUMPTIONS';
}
