import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface WebhookStatus {
  registered: boolean;
  lastRegisteredAt: string | null;
  lastCheckedAt: string;
  attempts: number;
  error?: string;
}

@Injectable()
export class WebhookRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(WebhookRecoveryService.name);
  private readonly WEBHOOK_CHECK_INTERVAL = 60_000;
  private readonly MAX_BACKOFF = 3_600_000;
  private currentBackoff = 2_000;
  private consecutiveFailures = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.startPeriodicCheck();
  }

  private startPeriodicCheck() {
    const run = () => {
      this.ensureWebhookRegistered().catch(err => {
        this.logger.error(`[WebhookRecovery] Check failed: ${(err as Error).message}`);
      });
    };
    setTimeout(run, 5_000).unref();
    setInterval(run, this.WEBHOOK_CHECK_INTERVAL).unref();
  }

  async ensureWebhookRegistered(): Promise<boolean> {
    const provider = process.env.WHATSAPP_PROVIDER || 'mock';
    if (provider !== 'openwa') return false;

    const apiUrl = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    const apiKey = process.env.OPENWA_API_KEY;
    const sessionId = process.env.OPENWA_SESSION_ID || '';
    const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/communication/webhook/whatsapp`;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      this.logger.warn(`[WebhookRecovery] Invalid session UUID format: ${sessionId}`);
      return false;
    }

    try {
      const existingResp = await axios.get(`${apiUrl}/sessions/${sessionId}/webhooks`, {
        headers: { 'X-API-Key': apiKey },
        timeout: 5000,
      });

      const webhooks: Array<{ url: string }> = existingResp.data?.webhooks ?? existingResp.data ?? [];
      const alreadyRegistered = webhooks.some((w: any) => w.url === webhookUrl || (typeof w === 'string' && w === webhookUrl));

      if (alreadyRegistered) {
        this.consecutiveFailures = 0;
        this.currentBackoff = 2_000;
        await this.saveWebhookStatus({ registered: true, lastRegisteredAt: new Date().toISOString(), lastCheckedAt: new Date().toISOString(), attempts: 0 });
        return true;
      }

      this.logger.log(`[WebhookRecovery] Webhook not found, registering ${webhookUrl}...`);

      await axios.post(
        `${apiUrl}/sessions/${sessionId}/webhooks`,
        { url: webhookUrl, events: ['*'] },
        { headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, timeout: 10_000 },
      );

      this.logger.log(`[WebhookRecovery] Webhook registered at ${webhookUrl}`);
      this.consecutiveFailures = 0;
      this.currentBackoff = 2_000;
      await this.saveWebhookStatus({ registered: true, lastRegisteredAt: new Date().toISOString(), lastCheckedAt: new Date().toISOString(), attempts: 0 });
      this.eventEmitter.emit('audit.log', {
        cafeId: '',
        action: 'WEBHOOK_REGISTER',
        metadata: { url: webhookUrl, sessionId, success: true },
      });
      return true;
    } catch (err) {
      this.consecutiveFailures++;
      this.currentBackoff = Math.min(this.currentBackoff * 2, this.MAX_BACKOFF);
      const msg = (err as Error).message;
      this.logger.warn(`[WebhookRecovery] Failed (${this.consecutiveFailures}x, next in ${this.currentBackoff}ms): ${msg}`);
      await this.saveWebhookStatus({ registered: false, lastRegisteredAt: null, lastCheckedAt: new Date().toISOString(), attempts: this.consecutiveFailures, error: msg });
      this.eventEmitter.emit('audit.log', {
        cafeId: '',
        action: 'WEBHOOK_REGISTER',
        metadata: { url: webhookUrl, sessionId, success: false, error: msg },
      });
      return false;
    }
  }

  private async saveWebhookStatus(status: WebhookStatus) {
    try {
      await this.redisService.setDashboardCache('webhook-status', status as unknown as Record<string, unknown>, 120);
    } catch {}
  }

  getWebhookBackoff(): number {
    return this.currentBackoff;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
}
