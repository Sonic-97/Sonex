import { IsString, IsNotEmpty, IsIn, IsNumber, Min, IsOptional } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['BARISTA', 'DRIVER'])
  role: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsNumber()
  @Min(0)
  salary: number;

  @IsString()
  @IsIn(['MONTHLY', 'DAILY', 'HOURLY'])
  salaryType: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  hourlyWage?: number;

  @IsString()
  @IsOptional()
  loginCode?: string;

  @IsString()
  @IsOptional()
  password?: string;
}
