import { IsEnum, IsOptional, IsString, IsNumber, IsUUID } from 'class-validator';

export enum UnifiedFulfillmentStatus {
  NEW = 'NEW',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  PICKED_UP = 'PICKED_UP',
  DELIVERED = 'DELIVERED',
  PAID = 'PAID',
  CLOSED = 'CLOSED',
  COMPLETED = 'COMPLETED',
}

export enum UnifiedCancelStatus {
  CANCELLED = 'CANCELLED',
  VOID = 'VOID',
}

export enum UnifiedPaymentStatusEnum {
  UNPAID = 'UNPAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

export class UpdateUnifiedOrderStatusDto {
  @IsEnum(UnifiedFulfillmentStatus)
  status: UnifiedFulfillmentStatus;

  @IsOptional()
  @IsEnum(UnifiedCancelStatus)
  cancelStatus?: UnifiedCancelStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  changedById?: string;

  @IsOptional()
  @IsString()
  changedByRole?: string;
}

export class UpdateUnifiedPaymentStatusDto {
  @IsEnum(UnifiedPaymentStatusEnum)
  paymentStatus: UnifiedPaymentStatusEnum;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsUUID()
  collectedById?: string;

  @IsOptional()
  @IsString()
  collectedRole?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
