import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum BossOrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
  DELIVERY = 'DELIVERY',
  WHATSAPP = 'WHATSAPP',
  PHONE = 'PHONE',
}

export enum BossPaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  RUNNING_ACCOUNT = 'RUNNING_ACCOUNT',
  WALLET = 'WALLET',
}

export class BossOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;
}

export class BossCafeOrderDto {
  @IsString()
  @IsNotEmpty()
  cafeId: string;

  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsEnum(BossOrderType)
  orderType: BossOrderType;

  @IsEnum(BossPaymentMethod)
  paymentMethod: BossPaymentMethod;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BossOrderItemDto)
  items: BossOrderItemDto[];

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  streetName?: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
