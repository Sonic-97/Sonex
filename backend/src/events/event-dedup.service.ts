import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class EventDedupService {
  private readonly logger = new Logger(EventDedupService.name);

  constructor(private readonly redisService: RedisService) {}

  async isDuplicate(key: string, ttlSeconds = 86400): Promise<boolean> {
    return this.redisService.exec(async (client) => {
      const result = await client.set(key, '1', { NX: true, EX: ttlSeconds });
      return result === null;
    }, false);
  }

  async processWithDedup<T>(key: string, fn: () => Promise<T>, ttlSeconds = 86400): Promise<{ data: T; deduplicated: boolean }> {
    const duplicate = await this.isDuplicate(key, ttlSeconds);
    if (duplicate) {
      return { data: null as unknown as T, deduplicated: true };
    }
    const data = await fn();
    return { data, deduplicated: false };
  }
}
