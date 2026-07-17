import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class EmployeeLoginDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  cafeId?: string;
}

