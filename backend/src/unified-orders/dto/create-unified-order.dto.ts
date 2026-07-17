import { IsArray, IsOptional, IsString, IsUUID, ValidateNested, IsInt, Min, IsNumber, IsPhoneNumber, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export enum UnifiedChannel {
  DELIVERY = 'DELIVERY',
  IN_CAFE = 'IN_CAFE',
  PICKUP = 'PICKUP',
  KIOSK = 'KIOSK',
  CATERING = 'CATERING',
}

export enum UnifiedSource {
  POS_TERMINAL = 'POS_TERMINAL',
  WEB = 'WEB',
  WHATSAPP = 'WHATSAPP',
  TELEGRAM = 'TELEGRAM',
  KIOSK_APP = 'KIOSK_APP',
  QR_ORDER = 'QR_ORDER',
  API = 'API',
  MANUAL = 'MANUAL',
  LEGACY_ORDER = 'LEGACY_ORDER',
  LEGACY_POS = 'LEGACY_POS',
  LEGACY_DELIVERY = 'LEGACY_DELIVERY',
}

export enum UnifiedOrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
  DELIVERY = 'DELIVERY',
}

export enum UnifiedPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

export class CreateUnifiedOrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modifiers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addons?: string[];
}

export class CreateUnifiedOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsPhoneNumber()
  customerPhone?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @IsUUID()
  collectedById?: string;

  @IsOptional()
  @IsString()
  collectedRole?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsEnum(UnifiedChannel)
  channel?: UnifiedChannel;

  @IsOptional()
  @IsEnum(UnifiedSource)
  source?: UnifiedSource;

  @IsOptional()
  @IsEnum(UnifiedOrderType)
  orderType?: UnifiedOrderType;

  @IsOptional()
  @IsString()
  tableNumber?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsEnum(UnifiedPaymentStatus)
  paymentStatus?: UnifiedPaymentStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsBoolean()
  stockDeducted?: boolean;

  @IsOptional()
  @IsBoolean()
  isRevenueConfirmed?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateUnifiedOrderItemDto)
  items: CreateUnifiedOrderItemDto[];
}
