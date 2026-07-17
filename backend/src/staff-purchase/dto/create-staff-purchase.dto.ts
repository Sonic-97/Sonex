import { IsUUID, IsInt, Min, IsOptional, IsNumber, IsString } from 'class-validator';

export class CreateStaffPurchaseDto {
  @IsUUID()
  staffId: string;

  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  customPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}




