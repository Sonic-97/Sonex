import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private connected = false;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      this.connected = true;
      this.logger.log('Redis connected');
    } catch (e) {
      this.logger.warn('Redis connection failed, running in dev mode without cache/queue features');
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      // ignore disconnect errors
    }
  }

  getClient(): Redis | null {
    return this.connected ? this.client : null;
  }

  private async cmd<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.connected) return fallback;
    try {
      return await fn();
    } catch (e) {
      this.logger.warn(`Redis command failed: ${(e as Error).message}`);
      return fallback;
    }
  }

  async exec<T>(fn: (client: any) => Promise<T>, fallback: T): Promise<T> {
    return this.cmd(() => fn(this.client), fallback);
  }

  async getSession(phone: string): Promise<Record<string, unknown> | null> {
    return this.cmd(async () => {
      const raw = await this.client.get(`session:${phone}`);
      return raw ? JSON.parse(raw) : null;
    }, null);
  }

  async setSession(phone: string, data: Record<string, unknown>, ttl = 3600): Promise<void> {
    return this.cmd(async () => {
      await this.client.setex(`session:${phone}`, ttl, JSON.stringify(data));
    }, undefined);
  }

  async delSession(phone: string): Promise<void> {
    return this.cmd(async () => {
      await this.client.del(`session:${phone}`);
    }, undefined);
  }

  async getOrderFlowSession(phone: string): Promise<Record<string, unknown> | null> {
    return this.cmd(async () => {
      const raw = await this.client.get(`orderflow:session:${phone}`);
      return raw ? JSON.parse(raw) : null;
    }, null);
  }

  async setOrderFlowSession(phone: string, data: Record<string, unknown>, ttl = 1800): Promise<void> {
    return this.cmd(async () => {
      await this.client.setex(`orderflow:session:${phone}`, ttl, JSON.stringify(data));
    }, undefined);
  }

  async delOrderFlowSession(phone: string): Promise<void> {
    return this.cmd(async () => {
      await this.client.del(`orderflow:session:${phone}`);
    }, undefined);
  }

  async acquireOrderFlowLock(phone: string, _ttl = 10000): Promise<boolean> {
    if (!this.connected) return true;
    try {
      const result = await this.client.set(`orderflow:lock:${phone}`, '1', 'PX', _ttl, 'NX');
      return result === 'OK';
    } catch (e) {
      this.logger.warn(`Redis acquireOrderFlowLock failed: ${(e as Error).message}`);
      return true;
    }
  }

  async releaseOrderFlowLock(phone: string): Promise<void> {
    return this.cmd(async () => {
      await this.client.del(`orderflow:lock:${phone}`);
    }, undefined);
  }

  async checkIdempotency(key: string): Promise<boolean> {
    return this.cmd(async () => {
      const exists = await this.client.get(`idempotency:${key}`);
      return exists !== null;
    }, false);
  }

  async setIdempotency(key: string, value: string, ttl = 86400): Promise<void> {
    return this.cmd(async () => {
      await this.client.setex(`idempotency:${key}`, ttl, value);
    }, undefined);
  }

  async checkRateLimit(key: string, max: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }> {
    if (!this.connected) return { allowed: true, remaining: max };
    try {
      const now = Date.now();
      const windowKey = `ratelimit:${key}`;

      const result = await this.client
        .multi()
        .zremrangebyscore(windowKey, 0, now - windowSec * 1000)
        .zadd(windowKey, now.toString(), `${now}:${Math.random()}`)
        .zcard(windowKey)
        .expire(windowKey, windowSec)
        .exec();

      const count = (result?.[2]?.[1] as number) ?? 0;
      return {
        allowed: count <= max,
        remaining: Math.max(0, max - count),
      };
    } catch (e) {
      this.logger.warn(`Redis checkRateLimit failed: ${(e as Error).message}`);
      return { allowed: true, remaining: max };
    }
  }

  async isDuplicateEvent(eventId: string): Promise<boolean> {
    if (!this.connected) return false;
    try {
      const key = `dedup:event:${eventId}`;
      const exists = await this.client.get(key);
      if (exists) return true;
      await this.client.setex(key, 300, '1');
      return false;
    } catch (e) {
      this.logger.warn(`Redis isDuplicateEvent failed: ${(e as Error).message}`);
      return false;
    }
  }

  async acquireLock(resource: string, _ttl = 5000): Promise<boolean> {
    if (!this.connected) return true;
    try {
      const result = await this.client.set(`lock:${resource}`, '1', 'PX', _ttl, 'NX');
      return result === 'OK';
    } catch (e) {
      this.logger.warn(`Redis acquireLock failed: ${(e as Error).message}`);
      return true;
    }
  }

  async releaseLock(resource: string): Promise<void> {
    return this.cmd(async () => {
      await this.client.del(`lock:${resource}`);
    }, undefined);
  }

  async pushLiveOrder(orderId: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.lpush('orders:live', orderId);
      await this.client.ltrim('orders:live', 0, 99);
    } catch (e) {
      this.logger.warn(`Redis pushLiveOrder failed: ${(e as Error).message}`);
    }
  }

  async getLiveOrders(): Promise<string[]> {
    if (!this.connected) return [];
    try {
      return this.client.lrange('orders:live', 0, -1);
    } catch (e) {
      this.logger.warn(`Redis getLiveOrders failed: ${(e as Error).message}`);
      return [];
    }
  }

  async removeLiveOrder(orderId: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.lrem('orders:live', 0, orderId);
    } catch (e) {
      this.logger.warn(`Redis removeLiveOrder failed: ${(e as Error).message}`);
    }
  }

  async getDashboardCache(key: string): Promise<Record<string, unknown> | null> {
    return this.cmd(async () => {
      const raw = await this.client.get(`dashboard:${key}`);
      return raw ? JSON.parse(raw) : null;
    }, null);
  }

  async setDashboardCache(key: string, data: Record<string, unknown>, ttl = 300): Promise<void> {
    return this.cmd(async () => {
      await this.client.setex(`dashboard:${key}`, ttl, JSON.stringify(data));
    }, undefined);
  }

  async invalidateDashboardCache(key: string): Promise<void> {
    return this.cmd(async () => {
      await this.client.del(`dashboard:${key}`);
    }, undefined);
  }

  async setStaffStatus(staffId: string, status: 'online' | 'offline' | 'busy'): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.set(`staff:status:${staffId}`, status);
    } catch (e) {
      this.logger.warn(`Redis setStaffStatus failed: ${(e as Error).message}`);
    }
  }

  async getStaffStatus(staffId: string): Promise<string | null> {
    return this.cmd(async () => {
      return this.client.get(`staff:status:${staffId}`);
    }, null);
  }

  async getAllStaffStatus(): Promise<Record<string, string>> {
    if (!this.connected) return {};
    try {
      const keys = await this.client.keys('staff:status:*');
      if (!keys.length) return {};
      const values = await this.client.mget(keys);
      const result: Record<string, string> = {};
      for (let i = 0; i < keys.length; i++) {
        const id = keys[i].replace('staff:status:', '');
        if (values[i]) result[id] = values[i];
      }
      return result;
    } catch (e) {
      this.logger.warn(`Redis getAllStaffStatus failed: ${(e as Error).message}`);
      return {};
    }
  }
}



