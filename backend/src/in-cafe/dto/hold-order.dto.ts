import { IsOptional, IsString } from 'class-validator';

export class HoldOrderDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
