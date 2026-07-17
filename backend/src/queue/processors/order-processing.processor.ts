import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue.config';
import { QueueService } from '../queue.service';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantContextService } from '../../common/tenant-context.service';

@Processor(QUEUE_NAMES.ORDER_PROCESSING, { concurrency: 5 })
export class OrderProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessingProcessor.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const { cafeId } = job.data as { cafeId?: string };
    this.logger.debug(`Processing job ${job.id} (${job.name})`);

    const idempotent = await this.redisService.checkIdempotency(`job:${job.id}`);
    if (idempotent) {
      this.logger.warn(`Job ${job.id} already processed (idempotency)`);
      return { skipped: true, reason: 'idempotency' };
    }

    const execute = () => {
      switch (job.name) {
        case 'create-order':
          return this.handleCreateOrder(job);
        case 'create-order-from-ai':
          return this.handleCreateOrderFromAI(job);
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
          return { error: `Unknown job: ${job.name}` };
      }
    };

    try {
      return cafeId ? TenantContextService.run(cafeId, execute) : execute();
    } catch (err) {
      this.logger.error(`Job ${job.id} failed: ${(err as Error).message}`);
      if (job.attemptsMade >= (job.opts?.attempts ?? 5) - 1) {
        await this.queueService.sendToDeadLetter(QUEUE_NAMES.ORDER_PROCESSING, {
          name: job.name,
          data: job.data,
          error: (err as Error).message,
        });
      }
      throw err;
    }
  }

  private async handleCreateOrder(job: Job<Record<string, unknown>>) {
    const { customerId, staffId, items, type, address } = job.data;

    this.eventEmitter.emit('order.create.requested', {
      customerId,
      staffId,
      items,
      type,
      address,
      queueJobId: job.id,
    });

    return { status: 'delegated' };
  }

  private async handleCreateOrderFromAI(job: Job<Record<string, unknown>>) {
    const { customerPhone, aiData, queueJobId } = job.data;

    this.eventEmitter.emit('order.create-from-ai.requested', {
      customerPhone,
      aiData,
      queueJobId,
    });

    return { status: 'delegated' };
  }
}




