import { Injectable, Logger } from '@nestjs/common';
import { WebhookRecoveryService } from '../../reliability/webhook-recovery.service';
import { RecoveryJobExecutor, RecoveryJobScheduler } from '../recovery-jobs.scheduler';
import { RECOVERY_JOB_NAMES, JobResult } from '../recovery-jobs.constants';

@Injectable()
export class WebhookVerifyExecutor implements RecoveryJobExecutor {
  readonly jobName = RECOVERY_JOB_NAMES.WEBHOOK_VERIFY;
  private readonly logger = new Logger(WebhookVerifyExecutor.name);

  constructor(
    private readonly webhookRecoveryService: WebhookRecoveryService,
    scheduler: RecoveryJobScheduler,
  ) {
    scheduler.register(this);
  }

  async run(): Promise<JobResult> {
    const start = Date.now();
    const provider = process.env.WHATSAPP_PROVIDER || 'mock';
    if (provider !== 'openwa') {
      return { ok: true, duration: Date.now() - start, processed: 0 };
    }

    const registered = await this.webhookRecoveryService.ensureWebhookRegistered();
    if (!registered) {
      return { ok: false, duration: Date.now() - start, error: 'Webhook registration failed' };
    }
    return { ok: true, duration: Date.now() - start, processed: 1 };
  }
}
