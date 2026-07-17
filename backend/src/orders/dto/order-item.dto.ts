import { IsInt, Min, IsOptional, IsString } from 'class-validator';

export class OrderItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}




