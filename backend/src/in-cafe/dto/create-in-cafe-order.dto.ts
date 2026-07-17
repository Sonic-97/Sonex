import { IsArray, IsOptional, IsString, IsUUID, ValidateNested, IsInt, Min, IsNumber, IsPhoneNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class SelectedOptionDto {
  @IsUUID()
  optionId: string;

  @IsString()
  choiceLabel: string;
}

export class InCafeOrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedOptionDto)
  selectedOptions?: SelectedOptionDto[];
}

export class CreateInCafeOrderDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsPhoneNumber()
  customerPhone?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  orderType?: string; // DINE_IN, TAKEAWAY, DELIVERY

  @IsOptional()
  @IsString()
  sourceType?: string; // INSIDE_CAFE, OUTSIDE_CAFE, WHATSAPP_ORDER

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  tableNumber?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string; // PAID, NOT_PAID

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsUUID()
  createdById: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InCafeOrderItemDto)
  items: InCafeOrderItemDto[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}




