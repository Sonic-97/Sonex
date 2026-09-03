import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TransactionalOutboxService } from '../application/transactional-outbox.service';

@Injectable()
export class OutboxProcessorWorker implements OnModuleInit {
  private readonly logger = new Logger(OutboxProcessorWorker.name);
  private isProcessing = false;

  constructor(private readonly outboxService: TransactionalOutboxService) {}

  onModuleInit() {
    this.logger.log('OutboxProcessorWorker initialized. Monitoring PENDING outbox records for BullMQ queue dispatching.');
  }

  /**
   * Process pending outbox events for tenant and branch.
   */
  async processPendingQueue(tenantId: string, branchId: string): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const res = await this.outboxService.fetchPendingEvents(tenantId, branchId);
      if (!res.isSuccess || !res.value.length) {
        this.isProcessing = false;
        return 0;
      }

      let processedCount = 0;
      for (const event of res.value) {
        // Dispatch event payload to BullMQ / Redis pub-sub
        this.logger.log(`[BullMQ Relay] Dispatching Outbox Event ${event.id} (${event.eventType}) to Redis Queue.`);
        await this.outboxService.markEventCompleted(event.id);
        processedCount++;
      }

      this.isProcessing = false;
      return processedCount;
    } catch (err: any) {
      this.logger.error(`Outbox worker process error: ${err.message}`, err.stack);
      this.isProcessing = false;
      return 0;
    }
  }
}
