import { IsString, IsNotEmpty, IsOptional, IsIn, IsObject, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

class DateRangeDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

export class GenerateReportDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['SALES', 'ORDERS', 'PROFIT', 'INVENTORY', 'EMPLOYEE_PERFORMANCE'])
  type: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange?: DateRangeDto;

  @IsOptional()
  @IsString()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  groupBy?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  employee?: string;

  @IsOptional()
  @IsString()
  @IsIn(['BARISTA', 'DRIVER'])
  employeeRole?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PDF', 'EXCEL'])
  format?: string;
}

export class ReportQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class AnalyticsKpiQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['today', 'week', 'month', 'custom'])
  dateRange?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ChartQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['today', 'week', 'month', 'year', 'custom'])
  dateRange?: string;

  @IsOptional()
  @IsString()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  groupBy?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}




