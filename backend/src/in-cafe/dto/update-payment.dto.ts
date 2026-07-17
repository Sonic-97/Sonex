import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum PaymentStatus {
  PAID = 'PAID',
  NOT_PAID = 'NOT_PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  WALLET = 'WALLET',
  MIXED = 'MIXED',
}

export class UpdatePaymentDto {
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsNumber()
  @Min(0)
  paidAmount: number;

  @IsOptional()
  @IsString()
  voidReason?: string;
}




