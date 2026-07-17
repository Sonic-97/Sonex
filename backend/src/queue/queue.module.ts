import { DynamicModule, Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueRegistrations } from './queue.config';
import { QueueService, NoopQueueService } from './queue.service';
import { QueueBridge } from './queue-bridge.service';
import { DeadLetterService } from './dead-letter.service';
import { JobLogService } from './job-log.service';
import { OrderProcessingProcessor } from './processors/order-processing.processor';
import { FinancialProcessingProcessor } from './processors/financial-processing.processor';
import { AnalyticsProcessingProcessor } from './processors/analytics-processing.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { WhatsAppProcessor } from './processors/whatsapp.processor';
import { InventoryProcessor } from './processors/inventory.processor';
import { ReportsProcessor } from './processors/reports.processor';

@Global()
export class QueueModule {
  static forRoot(): DynamicModule {
    const enabled = process.env.ENABLE_QUEUES === 'true';

    if (!enabled) {
      return {
        module: QueueModule,
        global: true,
        providers: [
          { provide: QueueService, useClass: NoopQueueService },
        ],
        exports: [QueueService],
      };
    }

    return {
      module: QueueModule,
      global: true,
      imports: [
        BullModule.forRoot({
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || undefined,
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: { age: 86400 },
            removeOnFail: { age: 604800 },
          },
        }),
        ...QueueRegistrations,
      ],
      providers: [
        QueueService,
        QueueBridge,
        DeadLetterService,
        JobLogService,
        OrderProcessingProcessor,
        FinancialProcessingProcessor,
        AnalyticsProcessingProcessor,
        NotificationProcessor,
        WhatsAppProcessor,
        InventoryProcessor,
        ReportsProcessor,
      ],
      exports: [
        QueueService,
        QueueBridge,
        DeadLetterService,
        JobLogService,
      ],
    };
  }
}




