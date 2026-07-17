import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAMES, DLQ_NAMES } from './queue.config';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ORDER_PROCESSING) private readonly orderQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FINANCIAL_PROCESSING) private readonly financialQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ANALYTICS_PROCESSING) private readonly analyticsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WHATSAPP) private readonly whatsappQueue: Queue,
    @InjectQueue(QUEUE_NAMES.INVENTORY) private readonly inventoryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.INVENTORY_SYNC) private readonly inventorySyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.REPORTS) private readonly reportsQueue: Queue,
    @InjectQueue(DLQ_NAMES.ORDER_PROCESSING_DLQ) private readonly orderDlq: Queue,
    @InjectQueue(DLQ_NAMES.FINANCIAL_PROCESSING_DLQ) private readonly financialDlq: Queue,
    @InjectQueue(DLQ_NAMES.ANALYTICS_PROCESSING_DLQ) private readonly analyticsDlq: Queue,
    @InjectQueue(DLQ_NAMES.NOTIFICATION_DLQ) private readonly notificationDlq: Queue,
    @InjectQueue(DLQ_NAMES.WHATSAPP_DLQ) private readonly whatsappDlq: Queue,
    @InjectQueue(DLQ_NAMES.INVENTORY_DLQ) private readonly inventoryDlq: Queue,
    @InjectQueue(DLQ_NAMES.INVENTORY_SYNC_DLQ) private readonly inventorySyncDlq: Queue,
    @InjectQueue(DLQ_NAMES.REPORTS_DLQ) private readonly reportsDlq: Queue,
  ) {}

  async addOrderJob(name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    return this.addJob(this.orderQueue, name, data, opts);
  }

  async addFinancialJob(name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    return this.addJob(this.financialQueue, name, data, opts);
  }

  async addAnalyticsJob(name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    return this.addJob(this.analyticsQueue, name, data, opts);
  }

  async addNotificationJob(name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    return this.addJob(this.notificationQueue, name, data, opts);
  }

  async addWhatsAppJob(name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    return this.addJob(this.whatsappQueue, name, data, opts);
  }

  async addInventoryJob(name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    return this.addJob(this.inventoryQueue, name, data, opts);
  }

  async addInventorySyncJob(name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    return this.addJob(this.inventorySyncQueue, name, data, opts);
  }

  async addReportsJob(name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    return this.addJob(this.reportsQueue, name, data, opts);
  }

  async sendToDeadLetter(queueName: string, job: { name: string; data: Record<string, unknown>; error: string }) {
    const dlqMap: Record<string, Queue> = {
      [QUEUE_NAMES.ORDER_PROCESSING]: this.orderDlq,
      [QUEUE_NAMES.FINANCIAL_PROCESSING]: this.financialDlq,
      [QUEUE_NAMES.ANALYTICS_PROCESSING]: this.analyticsDlq,
      [QUEUE_NAMES.NOTIFICATION]: this.notificationDlq,
      [QUEUE_NAMES.WHATSAPP]: this.whatsappDlq,
      [QUEUE_NAMES.INVENTORY]: this.inventoryDlq,
      [QUEUE_NAMES.INVENTORY_SYNC]: this.inventorySyncDlq,
      [QUEUE_NAMES.REPORTS]: this.reportsDlq,
    };

    const dlq = dlqMap[queueName];
    if (!dlq) {
      this.logger.warn(`No DLQ configured for ${queueName}`);
      return;
    }

    await dlq.add(job.name, { ...job.data, _error: job.error, _originalQueue: queueName });
    this.logger.warn(`Job ${job.name} sent to DLQ ${dlq.name}`);
  }

  private async addJob(queue: Queue, name: string, data: Record<string, unknown>, opts?: { jobId?: string; delay?: number }) {
    const job = await queue.add(name, data, {
      jobId: opts?.jobId,
      delay: opts?.delay,
    });
    this.logger.debug(`Job ${job.id} (${name}) added to ${queue.name}`);
    return job;
  }

  async getQueueMetrics() {
    const allQueues = [
      this.orderQueue, this.financialQueue, this.analyticsQueue,
      this.notificationQueue, this.whatsappQueue, this.inventoryQueue,
      this.inventorySyncQueue, this.reportsQueue,
    ];
    const metrics = await Promise.all(
      allQueues.map(async (q) => {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          q.getWaitingCount(),
          q.getActiveCount(),
          q.getCompletedCount(),
          q.getFailedCount(),
          q.getDelayedCount(),
        ]);
        return {
          name: q.name,
          waiting,
          active,
          completed,
          failed,
          delayed,
        };
      }),
    );
    return metrics;
  }
}

@Injectable()
export class NoopQueueService {
  private readonly logger = new Logger('QueueService');

  async addOrderJob(name: string, _data: Record<string, unknown>, _opts?: { jobId?: string; delay?: number }) {
    this.logger.debug(`[dev] Skipping order job: ${name} (ENABLE_QUEUES != true)`);
    return null;
  }

  async addFinancialJob(name: string, _data: Record<string, unknown>, _opts?: { jobId?: string; delay?: number }) {
    this.logger.debug(`[dev] Skipping financial job: ${name}`);
    return null;
  }

  async addAnalyticsJob(name: string, _data: Record<string, unknown>, _opts?: { jobId?: string; delay?: number }) {
    this.logger.debug(`[dev] Skipping analytics job: ${name}`);
    return null;
  }

  async addNotificationJob(name: string, _data: Record<string, unknown>, _opts?: { jobId?: string; delay?: number }) {
    this.logger.debug(`[dev] Skipping notification job: ${name}`);
    return null;
  }

  async addWhatsAppJob(name: string, _data: Record<string, unknown>, _opts?: { jobId?: string; delay?: number }) {
    this.logger.debug(`[dev] Skipping whatsapp job: ${name}`);
    return null;
  }

  async addInventoryJob(name: string, _data: Record<string, unknown>, _opts?: { jobId?: string; delay?: number }) {
    this.logger.debug(`[dev] Skipping inventory job: ${name}`);
    return null;
  }

  async addInventorySyncJob(name: string, _data: Record<string, unknown>, _opts?: { jobId?: string; delay?: number }) {
    this.logger.debug(`[dev] Skipping inventory sync job: ${name}`);
    return null;
  }

  async addReportsJob(name: string, _data: Record<string, unknown>, _opts?: { jobId?: string; delay?: number }) {
    this.logger.debug(`[dev] Skipping reports job: ${name}`);
    return null;
  }

  async sendToDeadLetter(_queueName: string, _job: { name: string; data: Record<string, unknown>; error: string }) {
    this.logger.debug('[dev] Skipping dead letter send');
  }

  async getQueueMetrics() {
    return [];
  }
}




