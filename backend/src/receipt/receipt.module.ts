import { Module } from '@nestjs/common';
import { ReceiptController } from './receipt.controller';
import { ReceiptPrintService } from './receipt-print.service';
import { ReceiptTemplateService } from './receipt-template.service';
import { ReceiptRenderer } from './receipt-renderer.service';
import { PrinterAdapter } from './printer-adapter.service';

@Module({
  controllers: [ReceiptController],
  providers: [
    ReceiptPrintService,
    ReceiptTemplateService,
    ReceiptRenderer,
    PrinterAdapter,
  ],
  exports: [ReceiptPrintService, ReceiptTemplateService, ReceiptRenderer, PrinterAdapter],
})
export class ReceiptModule {}
