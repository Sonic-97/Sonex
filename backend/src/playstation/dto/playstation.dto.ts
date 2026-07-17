import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsEnum, Min, IsUUID } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateDeviceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdatePricingDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  singlePlayerHourlyPrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  twoPlayersHourlyPrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  threePlayersHourlyPrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fourPlayersHourlyPrice: number;
}

export enum SessionType {
  SINGLE_PLAYER = 'Single Player',
  TWO_PLAYERS = 'Two Players',
  THREE_PLAYERS = 'Three Players',
  FOUR_PLAYERS = 'Four Players',
}

export class StartSessionDto {
  @IsUUID()
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsEnum(SessionType)
  sessionType: SessionType;

  @IsUUID()
  @IsOptional()
  employeeId?: string;
}

export class CloseSessionDto {
  @IsString()
  @IsNotEmpty()
  paymentStatus: string; // PAID, UNPAID
}
