import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface ComponentHealth {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface HealthResult {
  status: 'ok' | 'degraded' | 'down';
  components: Record<string, ComponentHealth>;
  timestamp: string;
}

@Injectable()
export class HealthIndicatorsService {
  private readonly logger = new Logger(HealthIndicatorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async checkAll(): Promise<HealthResult> {
    const [db, redis, openwa, queue] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkOpenWA(),
      this.checkQueue(),
    ]);

    const components = { database: db, redis, openwa, queue };
    const allOk = Object.values(components).every((c) => c.status === 'ok');
    const anyDown = Object.values(components).some((c) => c.status === 'down');

    return {
      status: anyDown ? 'down' : allOk ? 'ok' : 'degraded',
      components,
      timestamp: new Date().toISOString(),
    };
  }

  async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  async checkRedis(): Promise<ComponentHealth> {
    const client = this.redisService.getClient();
    if (!client) return { status: 'down', error: 'Redis client not connected' };
    try {
      const start = Date.now();
      const pong = await client.ping();
      return { status: pong === 'PONG' ? 'ok' : 'degraded', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: (err as Error).message };
    }
  }

  async checkOpenWA(): Promise<ComponentHealth> {
    const apiUrl = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const apiKey = process.env.OPENWA_API_KEY;
    const start = Date.now();
    try {
      const res = await axios.get(`${apiUrl}/health`, {
        headers: { 'X-API-Key': apiKey },
        timeout: 5000,
      });
      return { status: res.status === 200 ? 'ok' : 'degraded', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  async checkQueue(): Promise<ComponentHealth> {
    try {
      return { status: 'ok' };
    } catch (err) {
      return { status: 'degraded', error: (err as Error).message };
    }
  }
}
