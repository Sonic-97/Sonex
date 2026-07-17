import { IsArray, IsOptional, IsString, IsUUID, ValidateNested, IsInt, Min, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class EditItemDto {
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

class SelectedOptionDto {
  @IsUUID()
  optionId: string;

  @IsString()
  choiceLabel: string;
}

export class EditInCafeOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditItemDto)
  items: EditItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
