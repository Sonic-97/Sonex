import { IsString, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';

export class CollectPaymentDto {
  @IsString()
  orderId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  method?: string;

  @IsString()
  collectedById: string;

  @IsString()
  collectedRole: 'BARISTA' | 'DRIVER';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkOrderPaymentDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsString()
  paymentStatus: 'PAID' | 'UNPAID' | 'PARTIAL_PAYMENT';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @IsString()
  method?: string;

  @IsString()
  collectedById: string;

  @IsString()
  collectedRole: 'BARISTA' | 'DRIVER';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DriverConfirmDeliveryDto {
  @IsString()
  orderId: string;

  @IsString()
  driverId: string;

  @IsString()
  deliveryStatus: 'DELIVERED' | 'FAILED';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountCollected?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}



