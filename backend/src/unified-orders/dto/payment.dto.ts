import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  WALLET = 'WALLET',
  MIXED = 'MIXED',
  TRANSFER = 'TRANSFER',
}

export class SplitPaymentItemDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber()
  @Min(0)
  amount: number;
}

export class RecordPaymentDto {
  @IsUUID()
  orderId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsUUID()
  collectedById: string;

  @IsString()
  collectedRole: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitPaymentItemDto)
  splitPayments?: SplitPaymentItemDto[];
}

export class SettleDebtDto {
  @IsUUID()
  debtId: string;

  @IsUUID()
  settledById: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}
