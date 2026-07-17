import { IsString, IsNotEmpty } from 'class-validator';

export class CafeLoginDto {
  @IsString()
  @IsNotEmpty()
  ownerCode: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
