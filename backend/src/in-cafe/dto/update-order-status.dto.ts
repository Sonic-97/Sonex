import { IsString, IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(['NEW', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'ON_HOLD'])
  status: string;
}
