import {
  IsArray,
  IsOptional,
  IsString,
  IsEnum,
  ValidateNested,
  IsPhoneNumber,
  IsUUID,
} from 'class-validator';

import { Type } from 'class-transformer';
import { OrderItemDto } from './order-item.dto';

export enum OrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
  DELIVERY = 'DELIVERY',
}

export enum SourceType {
  INSIDE_CAFE = 'INSIDE_CAFE',
  OUTSIDE_CAFE = 'OUTSIDE_CAFE',
  WHATSAPP_ORDER = 'WHATSAPP_ORDER',
}

export class CreateOrderDto {

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @IsPhoneNumber('EG')
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsEnum(OrderType)
  type: OrderType;

  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @IsOptional()
  @IsString()
  address?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}
export class CreateOrderAiDto {
  customerPhone: string;
  aiData: any;
}




