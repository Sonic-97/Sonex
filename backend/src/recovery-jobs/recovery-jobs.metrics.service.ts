import { Injectable } from '@nestjs/common';
import * as promClient from 'prom-client';
import { RECOVERY_JOB_NAMES } from './recovery-jobs.constants';

@Injectable()
export class RecoveryJobsMetricsService {
  private readonly registry: promClient.Registry;

  private readonly jobAttempts: promClient.Counter<string>;
  private readonly jobDuration: promClient.Histogram<string>;
  private readonly jobLastRun: promClient.Gauge<string>;
  private readonly jobQueueDepth: promClient.Gauge<string>;

  constructor() {
    this.registry = new promClient.Registry();

    const jobNames = Object.values(RECOVERY_JOB_NAMES);

    this.jobAttempts = new promClient.Counter({
      name: 'recovery_job_attempts_total',
      help: 'Total recovery job attempts',
      labelNames: ['job', 'result'],
      registers: [this.registry],
    });

    this.jobDuration = new promClient.Histogram({
      name: 'recovery_job_duration_seconds',
      help: 'Duration of recovery jobs',
      labelNames: ['job'],
      buckets: [1, 5, 15, 30, 60, 120, 300],
      registers: [this.registry],
    });

    this.jobLastRun = new promClient.Gauge({
      name: 'recovery_job_last_run_timestamp',
      help: 'Unix timestamp of last recovery job run',
      labelNames: ['job'],
      registers: [this.registry],
    });

    this.jobQueueDepth = new promClient.Gauge({
      name: 'recovery_job_queue_depth',
      help: 'Current queue depth for recovery jobs',
      labelNames: ['job'],
      registers: [this.registry],
    });
  }

  recordAttempt(jobName: string, result: 'success' | 'failure'): void {
    this.jobAttempts.inc({ job: jobName, result });
  }

  recordDuration(jobName: string, durationMs: number): void {
    this.jobDuration.observe({ job: jobName }, durationMs / 1000);
  }

  recordLastRun(jobName: string): void {
    this.jobLastRun.set({ job: jobName }, Date.now() / 1000);
  }

  setQueueDepth(jobName: string, depth: number): void {
    this.jobQueueDepth.set({ job: jobName }, depth);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
