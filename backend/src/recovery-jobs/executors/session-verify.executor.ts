import { Injectable, Logger } from '@nestjs/common';
import { SessionRecoveryOrchestrator } from '../../reliability/session-recovery-orchestrator.service';
import { RecoveryJobExecutor, RecoveryJobScheduler } from '../recovery-jobs.scheduler';
import { RECOVERY_JOB_NAMES, JobResult } from '../recovery-jobs.constants';

@Injectable()
export class SessionVerifyExecutor implements RecoveryJobExecutor {
  readonly jobName = RECOVERY_JOB_NAMES.SESSION_VERIFY;
  private readonly logger = new Logger(SessionVerifyExecutor.name);

  constructor(
    private readonly orchestrator: SessionRecoveryOrchestrator,
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

    const status = await this.orchestrator.runRecoveryPipeline();
    return {
      ok: status.ok,
      duration: Date.now() - start,
      processed: status.ok ? 1 : 0,
      error: status.error,
    };
  }
}
