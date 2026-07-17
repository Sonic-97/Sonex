import { IsString, IsOptional, IsIn, IsBoolean, IsNumber, Min } from 'class-validator';

export class UpdateStaffDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @IsIn(['BARISTA', 'DRIVER'])
  role?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  salary?: number;

  @IsString()
  @IsOptional()
  @IsIn(['MONTHLY', 'DAILY', 'HOURLY'])
  salaryType?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  hourlyWage?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
