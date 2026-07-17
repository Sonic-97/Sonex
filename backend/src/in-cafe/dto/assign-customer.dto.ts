import { IsOptional, IsString, IsUUID, IsPhoneNumber } from 'class-validator';

export class AssignCustomerDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsPhoneNumber()
  customerPhone?: string;
}
