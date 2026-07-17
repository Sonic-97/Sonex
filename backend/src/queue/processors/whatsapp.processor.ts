import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue.config';
import { QueueService } from '../queue.service';
import { TenantContextService } from '../../common/tenant-context.service';

@Processor(QUEUE_NAMES.WHATSAPP, { concurrency: 5 })
export class WhatsAppProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsAppProcessor.name);

  constructor(
    private readonly queueService: QueueService,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const { cafeId } = job.data as { cafeId?: string };
    const execute = () => {
      switch (job.name) {
        case 'send-message':
          return this.handleSendMessage(job);
        case 'send-bulk':
          return this.handleSendBulk(job);
        default:
          this.logger.warn(`Unknown whatsapp job: ${job.name}`);
          return { error: `Unknown job: ${job.name}` };
      }
    };
    try {
      return cafeId ? TenantContextService.run(cafeId, execute) : execute();
    } catch (err) {
      this.logger.error(`WhatsApp job ${job.id} failed: ${(err as Error).message}`);
      if (job.attemptsMade >= (job.opts?.attempts ?? 3) - 1) {
        await this.queueService.sendToDeadLetter(QUEUE_NAMES.WHATSAPP, {
          name: job.name,
          data: job.data,
          error: (err as Error).message,
        });
      }
      throw err;
    }
  }

  private async handleSendMessage(job: Job<Record<string, unknown>>) {
    const { phone, message } = job.data as { phone: string; message: string };

    this.logger.log(`WhatsApp message to ${phone}: ${message?.substring(0, 80)}...`);

    return { sent: true, phone };
  }

  private async handleSendBulk(job: Job<Record<string, unknown>>) {
    const { recipients, message } = job.data as {
      recipients: Array<{ phone: string }>;
      message: string;
    };

    this.logger.log(`WhatsApp bulk message to ${recipients?.length || 0} recipients`);

    return { sent: true, count: recipients?.length || 0 };
  }
}




