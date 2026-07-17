import { IsString, IsOptional } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}




