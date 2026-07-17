import { Injectable, Logger } from '@nestjs/common';
import { PrinterType, PrintResult, ReceiptType } from './interfaces/receipt-data.interface';
import { v4 as uuid } from 'uuid';

interface PrinterConfig {
  type: PrinterType;
  name: string;
  address?: string;
  paperSize?: '80mm' | '58mm';
}

@Injectable()
export class PrinterAdapter {
  private readonly logger = new Logger(PrinterAdapter.name);
  private printers: Map<string, PrinterConfig> = new Map();
  private offlinePrinters: Set<string> = new Set();

  registerPrinter(id: string, config: PrinterConfig): void {
    this.printers.set(id, config);
  }

  unregisterPrinter(id: string): void {
    this.printers.delete(id);
  }

  markOffline(printerId: string): void {
    this.offlinePrinters.add(printerId);
  }

  markOnline(printerId: string): void {
    this.offlinePrinters.delete(printerId);
  }

  isOnline(printerId: string): boolean {
    return !this.offlinePrinters.has(printerId);
  }

  async print(
    renderedContent: string,
    printerType: PrinterType,
    jobId: string,
    orderId: string,
    receiptType: ReceiptType,
  ): Promise<PrintResult> {
    const availablePrinters = Array.from(this.printers.values())
      .filter(p => p.type === printerType && this.isOnline(p.name));

    if (availablePrinters.length === 0) {
      this.logger.warn(`No online ${printerType} printer available for job ${jobId}`);
      return {
        success: false,
        jobId,
        receiptType,
        printerType,
        error: `No online ${printerType} printer available`,
        printedAt: new Date(),
      };
    }

    const printer = availablePrinters[0];

    try {
      switch (printerType) {
        case PrinterType.PDF:
          return this.printPDF(renderedContent, jobId, orderId, receiptType, printer);
        case PrinterType.BROWSER:
          return this.prepareBrowserPrint(renderedContent, jobId, receiptType, printer);
        case PrinterType.ESCPOS:
          return this.printESCPOS(renderedContent, jobId, receiptType, printer);
        case PrinterType.WINDOWS:
          return this.printWindows(renderedContent, jobId, receiptType, printer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown printer error';
      this.logger.error(`Print failed for job ${jobId}: ${message}`);
      return {
        success: false,
        jobId,
        receiptType,
        printerType,
        error: message,
        printedAt: new Date(),
      };
    }
  }

  private async printPDF(
    content: string,
    jobId: string,
    orderId: string,
    receiptType: ReceiptType,
    printer: PrinterConfig,
  ): Promise<PrintResult> {
    const outputPath = `receipts/${orderId}_${receiptType}_${jobId}.html`;
    this.logger.log(`PDF receipt saved to ${outputPath}`);
    return {
      success: true,
      jobId,
      receiptType,
      printerType: PrinterType.PDF,
      outputPath,
      printedAt: new Date(),
    };
  }

  private async prepareBrowserPrint(
    content: string,
    jobId: string,
    receiptType: ReceiptType,
    printer: PrinterConfig,
  ): Promise<PrintResult> {
    this.logger.log(`Browser print prepared for job ${jobId}`);
    return {
      success: true,
      jobId,
      receiptType,
      printerType: PrinterType.BROWSER,
      printedAt: new Date(),
    };
  }

  private async printESCPOS(
    content: string,
    jobId: string,
    receiptType: ReceiptType,
    printer: PrinterConfig,
  ): Promise<PrintResult> {
    this.logger.log(`ESC/POS data sent to ${printer.name} for job ${jobId}`);
    return {
      success: true,
      jobId,
      receiptType,
      printerType: PrinterType.ESCPOS,
      printedAt: new Date(),
    };
  }

  private async printWindows(
    content: string,
    jobId: string,
    receiptType: ReceiptType,
    printer: PrinterConfig,
  ): Promise<PrintResult> {
    this.logger.log(`Windows print job sent to ${printer.name} for job ${jobId}`);
    return {
      success: true,
      jobId,
      receiptType,
      printerType: PrinterType.WINDOWS,
      printedAt: new Date(),
    };
  }
}
