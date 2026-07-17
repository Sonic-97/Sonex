import { IsString, IsOptional, IsNumber, IsArray, IsBoolean, Min, Max, IsObject } from 'class-validator';

export class BranchInfo {
  @IsString() name: string;
  @IsString() @IsOptional() slug?: string;
  @IsString() @IsOptional() location?: string;
  @IsString() @IsOptional() phone?: string;
}

export class SaveStep1Dto {
  @IsString() @IsOptional() businessName?: string;
  @IsString() @IsOptional() logo?: string;
  @IsString() @IsOptional() currency?: string;
  @IsString() @IsOptional() timezone?: string;
  @IsArray() @IsOptional() branches?: BranchInfo[];
}

export class MenuSuggestion {
  @IsString() name: string;
  @IsNumber() price: number;
  @IsString() @IsOptional() category?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() emoji?: string;
}

export class ImportMenuDto {
  @IsString() text: string;
}

export class SaveStep3Dto {
  @IsArray() products: MenuSuggestion[];
}

export class InventoryItemDto {
  @IsString() name: string;
  @IsString() unit: string;
  @IsNumber() @Min(0) currentQty: number;
  @IsNumber() @Min(0) minThreshold: number;
  @IsNumber() @Min(0) costPerUnit: number;
  @IsString() @IsOptional() supplierName?: string;
  @IsString() @IsOptional() emoji?: string;
}

export class SaveStep4Dto {
  @IsArray() items: InventoryItemDto[];
}

export class RecipeDto {
  @IsString() productId: string;
  @IsString() inventoryId: string;
  @IsNumber() @Min(0) quantity: number;
  @IsString() @IsOptional() unit?: string;
}

export class SaveStep5Dto {
  @IsArray() recipes: RecipeDto[];
}

export class TaxDto {
  @IsString() name: string;
  @IsNumber() @Min(0) rate: number;
  @IsString() @IsOptional() type?: string;
}

export class SaveStep6Dto {
  @IsArray() taxes: TaxDto[];
}

export class PaymentMethodDto {
  @IsString() name: string;
  @IsString() @IsOptional() type?: string;
}

export class SaveStep7Dto {
  @IsArray() methods: PaymentMethodDto[];
}

export class EmployeeDto {
  @IsString() name: string;
  @IsString() role: string;
  @IsString() phone: string;
  @IsNumber() @Min(0) salary: number;
  @IsString() salaryType: string;
  @IsString() @IsOptional() loginCode?: string;
}

export class SaveStep8Dto {
  @IsArray() employees: EmployeeDto[];
}

export class SaveStepDto {
  @IsNumber() @Min(1) @Max(9) step: number;
  @IsObject() data: any;
}
