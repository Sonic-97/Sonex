import { IsString, IsNumber, IsIn, IsOptional, IsDateString } from 'class-validator';

export class CreateEmployeePaymentDto {
  @IsString()
  staffId: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsIn(['SALARY', 'ADVANCE', 'BONUS'])
  type: 'SALARY' | 'ADVANCE' | 'BONUS';

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
