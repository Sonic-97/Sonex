import { BullModule } from '@nestjs/bullmq';

export const QUEUE_NAMES = {
  ORDER_PROCESSING: 'order-processing',
  FINANCIAL_PROCESSING: 'financial-processing',
  ANALYTICS_PROCESSING: 'analytics-processing',
  NOTIFICATION: 'notification',
  WHATSAPP: 'whatsapp',
  INVENTORY: 'inventory',
  INVENTORY_SYNC: 'inventory-sync',
  REPORTS: 'reports',
} as const;

export const DLQ_NAMES = {
  ORDER_PROCESSING_DLQ: 'order-processing-dlq',
  FINANCIAL_PROCESSING_DLQ: 'financial-processing-dlq',
  ANALYTICS_PROCESSING_DLQ: 'analytics-processing-dlq',
  NOTIFICATION_DLQ: 'notification-dlq',
  WHATSAPP_DLQ: 'whatsapp-dlq',
  INVENTORY_DLQ: 'inventory-dlq',
  INVENTORY_SYNC_DLQ: 'inventory-sync-dlq',
  REPORTS_DLQ: 'reports-dlq',
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
};

export const QueueRegistrations = [
  BullModule.registerQueue({ name: QUEUE_NAMES.ORDER_PROCESSING, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
  BullModule.registerQueue({ name: QUEUE_NAMES.FINANCIAL_PROCESSING, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
  BullModule.registerQueue({ name: QUEUE_NAMES.ANALYTICS_PROCESSING, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
  BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
  BullModule.registerQueue({ name: QUEUE_NAMES.WHATSAPP, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
  BullModule.registerQueue({ name: QUEUE_NAMES.INVENTORY, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
  BullModule.registerQueue({ name: QUEUE_NAMES.INVENTORY_SYNC, defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  } }),
  BullModule.registerQueue({ name: QUEUE_NAMES.REPORTS, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
  BullModule.registerQueue({ name: DLQ_NAMES.ORDER_PROCESSING_DLQ }),
  BullModule.registerQueue({ name: DLQ_NAMES.FINANCIAL_PROCESSING_DLQ }),
  BullModule.registerQueue({ name: DLQ_NAMES.ANALYTICS_PROCESSING_DLQ }),
  BullModule.registerQueue({ name: DLQ_NAMES.NOTIFICATION_DLQ }),
  BullModule.registerQueue({ name: DLQ_NAMES.WHATSAPP_DLQ }),
  BullModule.registerQueue({ name: DLQ_NAMES.INVENTORY_DLQ }),
  BullModule.registerQueue({ name: DLQ_NAMES.INVENTORY_SYNC_DLQ }),
  BullModule.registerQueue({ name: DLQ_NAMES.REPORTS_DLQ }),
];




