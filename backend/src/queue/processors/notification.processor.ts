import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue.config';
import { NotificationService } from '../../notifications/notification.service';
import { TenantContextService } from '../../common/tenant-context.service';

@Processor(QUEUE_NAMES.NOTIFICATION, { concurrency: 10 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notificationService: NotificationService) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const { cafeId } = job.data as { cafeId?: string };
    this.logger.debug(`Processing notification job ${job.id} (${job.name})`);

    const execute = () => {
      switch (job.name) {
        case 'create-notification':
          return this.handleCreateNotification(job);
        default:
          this.logger.warn(`Unknown notification job: ${job.name}`);
          return { error: `Unknown job: ${job.name}` };
      }
    };

    return cafeId ? TenantContextService.run(cafeId, execute) : execute();
  }

  private async handleCreateNotification(job: Job<Record<string, unknown>>) {
    const { type, title, message, data, userId, roleTarget } = job.data as Record<string, unknown>;

    const result = await this.notificationService.createNotification({
      type: type as string,
      title: title as string,
      message: message as string,
      data: data as Record<string, unknown> | undefined,
      userId: userId as string | undefined,
      roleTarget: (roleTarget as string) || 'Cafe',
    });

    this.logger.log(`Notification created: ${result.id} (${type})`);
    return { sent: true, notificationId: result.id };
  }
}




