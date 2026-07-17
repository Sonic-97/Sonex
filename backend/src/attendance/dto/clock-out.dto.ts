import { IsString, IsNotEmpty } from 'class-validator';

export class ClockOutDto {
  @IsString()
  @IsNotEmpty()
  staffId: string;
}
