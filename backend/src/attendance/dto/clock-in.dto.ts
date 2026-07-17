import { IsString, IsNotEmpty } from 'class-validator';

export class ClockInDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;
}
