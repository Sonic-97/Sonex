import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { ReceiptType, PrinterType, PrintTrigger } from '../interfaces/receipt-data.interface';

export class PrintReceiptDto {
  @IsUUID()
  orderId: string;

  @IsEnum(ReceiptType)
  receiptType: ReceiptType;

  @IsEnum(PrinterType)
  @IsOptional()
  printerType?: PrinterType;

  @IsEnum(PrintTrigger)
  @IsOptional()
  trigger?: PrintTrigger;

  @IsString()
  @IsOptional()
  cafeId?: string;
}
