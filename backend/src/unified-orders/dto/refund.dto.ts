import { IsString, IsNumber, IsOptional, IsUUID, IsArray, Min } from 'class-validator';

export class CreateRefundDto {
  @IsUUID()
  orderId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];

  @IsOptional()
  @IsUUID()
  processedById?: string;
}
