import { IsNotEmpty, IsString, IsNumber, Min, IsOptional } from 'class-validator';

export class CreateInventoryDto {
  @IsNotEmpty()
  @IsString()
  itemName: string;

  @IsNotEmpty()
  @IsString()
  unit: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  currentQty: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  minThreshold: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  costPerUnit: number;

  @IsOptional()
  @IsString()
  emoji?: string;
}
