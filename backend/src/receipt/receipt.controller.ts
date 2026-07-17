import { Controller, Post, Get, Param, Body, Query, NotFoundException } from '@nestjs/common';
import { PrintReceiptDto } from './dto/print-receipt.dto';
import { ReceiptPrintService } from './receipt-print.service';
import { ReceiptTemplateService } from './receipt-template.service';
import { ReceiptRenderer } from './receipt-renderer.service';
import { PrinterType, ReceiptType } from './interfaces/receipt-data.interface';

@Controller('receipts')
export class ReceiptController {
  constructor(
    private readonly printService: ReceiptPrintService,
    private readonly templateService: ReceiptTemplateService,
    private readonly renderer: ReceiptRenderer,
  ) {}

  @Post('print')
  async printReceipt(@Body() dto: PrintReceiptDto) {
    const receiptData = await this.buildReceiptData(dto.orderId, dto.cafeId);

    const result = await this.printService.print(
      receiptData,
      dto.receiptType,
      dto.printerType || PrinterType.BROWSER,
      dto.orderId,
      dto.trigger,
    );

    return result;
  }

  @Post('reprint/:orderId')
  async reprintReceipt(
    @Param('orderId') orderId: string,
    @Body() body: { receiptType: ReceiptType; printerType?: PrinterType; cafeId?: string },
  ) {
    const receiptData = await this.buildReceiptData(orderId, body.cafeId);

    const result = await this.printService.reprint(
      receiptData,
      body.receiptType,
      body.printerType || PrinterType.BROWSER,
      orderId,
    );

    return result;
  }

  @Get('preview/:orderId')
  async previewReceipt(
    @Param('orderId') orderId: string,
    @Query('type') type: ReceiptType,
    @Query('cafeId') cafeId?: string,
  ) {
    const receiptData = await this.buildReceiptData(orderId, cafeId);
    const receiptType = type || ReceiptType.CUSTOMER;
    const template = this.templateService.build(receiptData, receiptType);
    const html = this.renderer.render(template, PrinterType.BROWSER);

    return { html, receiptType, orderId };
  }

  @Get('queue')
  getQueueStatus() {
    return this.printService.getQueueStatus();
  }

  private async buildReceiptData(orderId: string, cafeId?: string): Promise<any> {
    return {
      header: {
        cafeName: 'Sonic Coffee',
        cafePhone: '+966 55 123 4567',
        cafeAddress: '123 Main Street, Riyadh',
        branchName: 'Main Branch',
      },
      order: {
        code: orderId,
        type: 'DINE_IN',
        tableNumber: '5',
        createdAt: new Date(),
        status: 'COMPLETED',
      },
      customer: {
        name: 'Customer',
        phone: '+966 55 000 0000',
      },
      items: [
        { name: 'Caramel Latte', emoji: '☕', quantity: 2, unitPrice: 12.0, total: 24.0 },
        { name: 'Croissant', quantity: 1, unitPrice: 12.0, total: 12.0 },
      ],
      totals: {
        subtotal: 36.0,
        discount: 0,
        total: 36.0,
        paid: 36.0,
        remaining: 0,
      },
      payment: {
        method: 'CARD',
        status: 'PAID',
      },
    };
  }
}
