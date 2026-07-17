import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  ReceiptData,
  ReceiptType,
  PrinterType,
  PrintJob,
  PrintResult,
  PrintTrigger,
} from './interfaces/receipt-data.interface';
import { ReceiptTemplateService } from './receipt-template.service';
import { ReceiptRenderer } from './receipt-renderer.service';
import { PrinterAdapter } from './printer-adapter.service';

interface PrintEventPayload {
  jobId: string;
  orderId: string;
  orderCode: string;
  receiptType: string;
  printerType: string;
  cafeId?: string;
  success: boolean;
  error?: string;
  printedAt: string;
}

@Injectable()
export class ReceiptPrintService implements OnModuleDestroy {
  private readonly logger = new Logger(ReceiptPrintService.name);
  private printQueue: PrintJob[] = [];
  private processing = false;
  private readonly maxRetries = 3;
  private retryDelayMs = 200;
  private listeners: Array<(payload: PrintEventPayload) => void> = [];

  setRetryDelay(ms: number): void {
    this.retryDelayMs = ms;
  }

  constructor(
    private readonly templateService: ReceiptTemplateService,
    private readonly renderer: ReceiptRenderer,
    private readonly printerAdapter: PrinterAdapter,
  ) {}

  onModuleDestroy(): void {
    this.printQueue = [];
  }

  onPrintEvent(callback: (payload: PrintEventPayload) => void): void {
    this.listeners.push(callback);
  }

  private emitPrintEvent(payload: PrintEventPayload): void {
    for (const listener of this.listeners) {
      try { listener(payload); } catch { /* ignore listener errors */ }
    }
  }

  async print(
    data: ReceiptData,
    receiptType: ReceiptType,
    printerType: PrinterType = PrinterType.BROWSER,
    orderId?: string,
    trigger?: PrintTrigger,
  ): Promise<PrintResult> {
    const jobId = uuid();
    const orderCode = data.order.code;

    const template = this.templateService.build(data, receiptType);
    const rendered = this.renderer.render(template, printerType);

    const job: PrintJob = {
      id: jobId,
      orderId: orderId || orderCode,
      receiptType,
      printerType,
      retriesLeft: this.maxRetries,
      maxRetries: this.maxRetries,
      status: 'pending',
      createdAt: new Date(),
    };
    this.printQueue.push(job);

    const result = await this.executePrint(job, rendered, data);

    this.emitPrintEvent({
      jobId,
      orderId: orderId || orderCode,
      orderCode,
      receiptType: receiptType.toString(),
      printerType: printerType.toString(),
      cafeId: data.header.cafeName,
      success: result.success,
      error: result.error,
      printedAt: result.printedAt.toISOString(),
    });

    return result;
  }

  private async executePrint(job: PrintJob, rendered: string, data: ReceiptData): Promise<PrintResult> {
    job.status = 'printing';

    const result = await this.printerAdapter.print(
      rendered,
      job.printerType,
      job.id,
      job.orderId,
      job.receiptType,
    );

    if (!result.success && job.retriesLeft > 0) {
      job.retriesLeft--;
      this.logger.warn(`Print job ${job.id} failed, retrying (${job.retriesLeft} left): ${result.error}`);

      await this.delay(this.retryDelayMs * (this.maxRetries - job.retriesLeft));

      return this.executePrint(job, rendered, data);
    }

    job.status = result.success ? 'completed' : 'failed';
    job.error = result.error;

    if (!result.success) {
      this.logger.error(`Print job ${job.id} failed after all retries: ${result.error}`);
    }

    return result;
  }

  async reprint(
    data: ReceiptData,
    receiptType: ReceiptType,
    printerType: PrinterType = PrinterType.BROWSER,
    orderId?: string,
  ): Promise<PrintResult> {
    this.logger.log(`Reprint requested for order ${orderId || data.order.code}`);
    return this.print(data, receiptType, printerType, orderId, PrintTrigger.MANUAL_REPRINT);
  }

  getQueueStatus(): { queued: number; completed: number; failed: number; inProgress: number } {
    return {
      queued: this.printQueue.filter(j => j.status === 'pending').length,
      completed: this.printQueue.filter(j => j.status === 'completed').length,
      failed: this.printQueue.filter(j => j.status === 'failed').length,
      inProgress: this.printQueue.filter(j => j.status === 'printing').length,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
