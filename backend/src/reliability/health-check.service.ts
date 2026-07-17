import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface HealthStatus {
  openwa: { ok: boolean; latencyMs: number; error?: string };
  redis: { ok: boolean; error?: string };
  database: { ok: boolean; error?: string };
  lastCheckedAt: string;
}

@Injectable()
export class HealthCheckService implements OnModuleInit {
  private readonly logger = new Logger(HealthCheckService.name);
  private lastStatus: HealthStatus | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit() {
    this.startPeriodicCheck();
  }

  private startPeriodicCheck() {
    const run = () => {
      this.checkAll().catch(err => {
        this.logger.error(`Health check failed: ${(err as Error).message}`);
      });
    };
    run();
    setInterval(run, 30_000).unref();
  }

  async checkAll(): Promise<HealthStatus> {
    const [openwa, redis, database] = await Promise.all([
      this.checkOpenWA(),
      this.checkRedis(),
      this.checkDatabase(),
    ]);

    this.lastStatus = { openwa, redis, database, lastCheckedAt: new Date().toISOString() };

    if (!openwa.ok || !redis.ok || !database.ok) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        this.logger.error(`[HEALTH_CRITICAL] System unhealthy (${this.consecutiveFailures}x): ${JSON.stringify(this.lastStatus)}`);
      }
    } else {
      if (this.consecutiveFailures > 0) {
        this.logger.log(`[HEALTH_RECOVERED] System healthy after ${this.consecutiveFailures} consecutive failures`);
      }
      this.consecutiveFailures = 0;
    }

    try {
      await this.redisService.setDashboardCache('health', this.lastStatus as unknown as Record<string, unknown>, 60);
    } catch {}

    return this.lastStatus;
  }

  getLastStatus(): HealthStatus | null {
    return this.lastStatus;
  }

  isHealthy(): boolean {
    return this.lastStatus?.openwa.ok === true && this.lastStatus?.redis.ok === true && this.lastStatus?.database.ok === true;
  }

  private async checkOpenWA(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const apiUrl = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const apiKey = process.env.OPENWA_API_KEY;
    const start = Date.now();
    try {
      const response = await axios.get(`${apiUrl}/health`, {
        headers: { 'X-API-Key': apiKey },
        timeout: 5000,
      });
      return { ok: response.status === 200, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<{ ok: boolean; error?: string }> {
    const client = this.redisService.getClient();
    if (!client) return { ok: false, error: 'Redis client not connected' };
    try {
      const pong = await client.ping();
      return { ok: pong === 'PONG' };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private async checkDatabase(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
