import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RECOVERY_JOB_NAMES, RECOVERY_JOB_SCHEDULES, RECOVERY_JOB_FLAGS, JobResult } from './recovery-jobs.constants';
import { RecoveryJobsMetricsService } from './recovery-jobs.metrics.service';

export interface RecoveryJobExecutor {
  readonly jobName: string;
  run(): Promise<JobResult>;
}

interface ScheduledJob {
  executor: RecoveryJobExecutor;
  interval: number;
  enabledFlag: string;
  timer: ReturnType<typeof setInterval> | null;
}

@Injectable()
export class RecoveryJobScheduler implements OnModuleInit {
  private readonly logger = new Logger(RecoveryJobScheduler.name);
  private readonly jobs: Map<string, ScheduledJob> = new Map();
  private readonly running = new Set<string>();

  constructor(
    private readonly metricsService: RecoveryJobsMetricsService,
  ) {}

  onModuleInit() {
    if (process.env.RECOVERY_JOBS_ENABLED === 'false') {
      this.logger.log('[RecoveryJobs] Disabled via RECOVERY_JOBS_ENABLED=false');
      return;
    }
    this.startAll();
  }

  register(executor: RecoveryJobExecutor, intervalOverride?: number): void {
    const name = executor.jobName;
    if (this.jobs.has(name)) return;
    const interval = intervalOverride ?? RECOVERY_JOB_SCHEDULES[name];
    const enabledFlag = RECOVERY_JOB_FLAGS[name];
    if (!interval) {
      this.logger.warn(`[RecoveryJobs] No schedule for ${name}, skipping`);
      return;
    }
    this.jobs.set(name, { executor, interval, enabledFlag, timer: null });
  }

  private startAll(): void {
    for (const [name, job] of this.jobs) {
      if (process.env[job.enabledFlag] === 'false') {
        this.logger.log(`[RecoveryJobs] ${name} disabled via ${job.enabledFlag}=false`);
        continue;
      }
      if (job.timer) continue;
      this.logger.log(`[RecoveryJobs] Scheduling ${name} every ${job.interval}ms`);
      job.timer = setInterval(() => this.execute(job), job.interval).unref();
      setTimeout(() => this.execute(job), 5_000).unref();
    }
  }

  private async execute(job: ScheduledJob): Promise<void> {
    if (this.running.has(job.executor.jobName)) return;
    this.running.add(job.executor.jobName);
    const start = Date.now();
    try {
      const result = await job.executor.run();
      this.metricsService.recordAttempt(job.executor.jobName, result.ok ? 'success' : 'failure');
      this.metricsService.recordDuration(job.executor.jobName, Date.now() - start);
      this.metricsService.recordLastRun(job.executor.jobName);
      if (!result.ok) {
        this.logger.warn(`[RecoveryJobs] ${job.executor.jobName}: ${result.error} (${result.processed ?? 0} processed)`);
      }
    } catch (err) {
      this.metricsService.recordAttempt(job.executor.jobName, 'failure');
      this.metricsService.recordDuration(job.executor.jobName, Date.now() - start);
      this.logger.error(`[RecoveryJobs] ${job.executor.jobName} threw: ${(err as Error).message}`);
    } finally {
      this.running.delete(job.executor.jobName);
    }
  }

  stopAll(): void {
    for (const [, job] of this.jobs) {
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = null;
      }
    }
  }
}
