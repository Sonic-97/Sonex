import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeadLetterService } from '../../reliability/dead-letter.service';
import { RecoveryJobExecutor, RecoveryJobScheduler } from '../recovery-jobs.scheduler';
import { RECOVERY_JOB_NAMES, JobResult } from '../recovery-jobs.constants';

@Injectable()
export class DeadLetterExecutor implements RecoveryJobExecutor {
  readonly jobName = RECOVERY_JOB_NAMES.DEAD_LETTER;
  private readonly logger = new Logger(DeadLetterExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deadLetterService: DeadLetterService,
    scheduler: RecoveryJobScheduler,
  ) {
    scheduler.register(this);
  }

  async run(): Promise<JobResult> {
    const start = Date.now();
    const cafes = await this.prisma.cafe.findMany({
      select: { id: true },
      where: { active: true },
    });

    let totalReplayed = 0;
    let totalFailed = 0;

    for (const cafe of cafes) {
      const result = await this.deadLetterService.replayAll(cafe.id);
      totalReplayed += result.replayed;
      totalFailed += result.failed;
    }

    if (totalReplayed > 0 || totalFailed > 0) {
      this.logger.log(`[DeadLetter] Replayed ${totalReplayed}, failed ${totalFailed}`);
    }

    return {
      ok: totalFailed === 0,
      duration: Date.now() - start,
      processed: totalReplayed,
      error: totalFailed > 0 ? `${totalFailed} entries failed to replay` : undefined,
    };
  }
}
