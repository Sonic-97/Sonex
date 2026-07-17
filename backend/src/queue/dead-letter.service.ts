import { Injectable, Logger } from '@nestjs/common';
import { QueueService } from './queue.service';
import { RedisService } from '../redis/redis.service';

interface DeadLetterRecord {
  id: string;
  cafeId?: string;
  queueName: string;
  jobName: string;
  payload: Record<string, unknown>;
  error: string;
  failedAt: string;
  attempts: number;
  resolved: boolean;
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly DL_PREFIX = 'dlq:record:';

  constructor(
    private readonly queueService: QueueService,
    private readonly redisService: RedisService,
  ) {}

  async recordFailure(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    error: string,
    attempts: number,
    cafeId?: string,
  ): Promise<void> {
    const record: DeadLetterRecord = {
      id: `${queueName}:${jobName}:${Date.now()}`,
      cafeId: cafeId || (payload.cafeId as string | undefined),
      queueName,
      jobName,
      payload,
      error,
      failedAt: new Date().toISOString(),
      attempts,
      resolved: false,
    };

    await this.redisService.getClient().setex(
      `${this.DL_PREFIX}${record.id}`,
      604800,
      JSON.stringify(record),
    );

    this.logger.warn(`Dead letter recorded: ${record.id} (${jobName} after ${attempts} attempts)`);
  }

  async getUnresolved(cafeId?: string): Promise<DeadLetterRecord[]> {
    const keys = await this.redisService.getClient().keys(`${this.DL_PREFIX}*`);
    if (!keys.length) return [];

    const values = await this.redisService.getClient().mget(keys);
    const records: DeadLetterRecord[] = [];

    for (const raw of values) {
      if (!raw) continue;
      const record = JSON.parse(raw) as DeadLetterRecord;
      if (record.resolved) continue;
      if (cafeId && record.cafeId !== cafeId) continue;
      records.push(record);
    }

    return records.sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());
  }

  async markResolved(id: string): Promise<void> {
    const raw = await this.redisService.getClient().get(`${this.DL_PREFIX}${id}`);
    if (!raw) {
      this.logger.warn(`Dead letter record not found: ${id}`);
      return;
    }

    const record = JSON.parse(raw) as DeadLetterRecord;
    record.resolved = true;
    await this.redisService.getClient().set(`${this.DL_PREFIX}${id}`, JSON.stringify(record));
  }

  async retryJob(id: string): Promise<boolean> {
    const raw = await this.redisService.getClient().get(`${this.DL_PREFIX}${id}`);
    if (!raw) return false;

    const record = JSON.parse(raw) as DeadLetterRecord;

    const queueMap: Record<string, string> = {
      'order-processing': 'order-processing',
      'financial-processing': 'financial-processing',
      'analytics-processing': 'analytics-processing',
      'notification': 'notification',
      'whatsapp': 'whatsapp',
      'inventory': 'inventory',
      'reports': 'reports',
    };

    const queueName = queueMap[record.queueName];
    if (!queueName) {
      this.logger.warn(`No queue mapping for ${record.queueName}`);
      return false;
    }

    const addJob = this.queueService.addOrderJob.bind(this.queueService);
    await addJob(record.jobName, record.payload, {
      jobId: `retry-${record.id}`,
    });

    record.resolved = true;
    await this.redisService.getClient().set(`${this.DL_PREFIX}${id}`, JSON.stringify(record));

    this.logger.log(`Retrying dead letter job: ${id}`);
    return true;
  }
}




