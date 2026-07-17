import { IsString, MinLength } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @MinLength(1)
  reason: string;
}
