import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsEnum, Min, IsUUID, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  deviceType?: string; // 'PS5' | 'PS4' | 'VIP_ROOM' | 'BILLIARDS' | 'PING_PONG'

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  hourlyRate?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  multiHourlyRate?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateDeviceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  deviceType?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  hourlyRate?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  multiHourlyRate?: number;

  @IsString()
  @IsOptional()
  notes?: string;

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

  @IsNumber()
  @Min(1)
  @IsOptional()
  targetDurationMinutes?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsOptional()
  employeeId?: string;
}

export class CloseSessionDto {
  @IsString()
  @IsNotEmpty()
  paymentStatus: string; // PAID, UNPAID
}

export class AddSessionOrderItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AddSessionOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddSessionOrderItemDto)
  items: AddSessionOrderItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class TransferSessionDto {
  @IsUUID()
  targetDeviceId: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SettleSessionDto {
  @IsString()
  @IsNotEmpty()
  paymentMethod: string; // 'CASH' | 'INSTAPAY' | 'VODAFONE_CASH' | 'CARD'

  @IsString()
  @IsNotEmpty()
  paymentStatus: string; // 'PAID' | 'UNPAID'

  @IsNumber()
  @Min(1)
  @IsOptional()
  splitCount?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
