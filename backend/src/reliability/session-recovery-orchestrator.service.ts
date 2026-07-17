import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HealthCheckService } from './health-check.service';
import { OpenwaSessionService } from './openwa-session.service';
import { WebhookRecoveryService } from './webhook-recovery.service';

export interface RecoveryStatus {
  phase: 'health' | 'session' | 'webhook' | 'complete';
  ok: boolean;
  duration: number;
  error?: string;
  consecutiveFailures: number;
  lastRecoveredAt: string | null;
}

@Injectable()
export class SessionRecoveryOrchestrator implements OnModuleInit {
  private readonly logger = new Logger(SessionRecoveryOrchestrator.name);
  private readonly CHECK_INTERVAL = 30_000;
  private consecutiveFailures = 0;
  private lastRecoveredAt: string | null = null;

  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly openwaSessionService: OpenwaSessionService,
    private readonly webhookRecoveryService: WebhookRecoveryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.startRecoveryLoop();
  }

  private startRecoveryLoop() {
    const run = () => {
      this.runRecoveryPipeline().catch(err => {
        this.logger.error(`[RecoveryOrchestrator] Pipeline failed: ${(err as Error).message}`);
      });
    };
    setTimeout(run, 5_000).unref();
    setInterval(run, this.CHECK_INTERVAL).unref();
  }

  async runRecoveryPipeline(): Promise<RecoveryStatus> {
    const provider = process.env.WHATSAPP_PROVIDER || 'mock';
    if (provider !== 'openwa') {
      return this.ok('complete', 0);
    }

    const start = Date.now();

    if (!(await this.phaseHealthCheck())) {
      return this.fail('health', Date.now() - start);
    }

    if (!(await this.phaseSessionCheck())) {
      return this.fail('session', Date.now() - start);
    }

    if (!(await this.phaseWebhookCheck())) {
      return this.fail('webhook', Date.now() - start);
    }

    return this.phaseComplete(Date.now() - start);
  }

  getRecoveryStatus(): RecoveryStatus {
    return {
      phase: this.openwaSessionService.isConnected() ? 'complete' : 'health',
      ok: this.openwaSessionService.isConnected(),
      duration: 0,
      consecutiveFailures: this.consecutiveFailures,
      lastRecoveredAt: this.lastRecoveredAt,
    };
  }

  private async phaseHealthCheck(): Promise<boolean> {
    try {
      const status = await this.healthCheckService.checkAll();
      if (status.openwa.ok) return true;
      this.logger.warn(`[RecoveryOrchestrator] Phase 1/4 FAILED: OpenWA unhealthy — ${status.openwa.error}`);
      return false;
    } catch (err) {
      this.logger.warn(`[RecoveryOrchestrator] Phase 1/4 ERROR: ${(err as Error).message}`);
      return false;
    }
  }

  private async phaseSessionCheck(): Promise<boolean> {
    try {
      await this.openwaSessionService.getStatus();
      if (this.openwaSessionService.isConnected()) return true;

      const sessionId = this.openwaSessionService.getSessionId();
      if (!sessionId) {
        this.logger.log(`[RecoveryOrchestrator] Phase 2/4: No session — creating...`);
        const newId = await this.openwaSessionService.createSession();
        if (!newId) return false;
        await this.sleep(3_000);
        return true;
      }

      this.logger.log(`[RecoveryOrchestrator] Phase 2/4: Session disconnected — reconnecting...`);
      const reconnected = await this.openwaSessionService.reconnect();
      if (reconnected) {
        await this.sleep(2_000);
        return true;
      }
      return false;
    } catch (err) {
      this.logger.warn(`[RecoveryOrchestrator] Phase 2/4 ERROR: ${(err as Error).message}`);
      return false;
    }
  }

  private async phaseWebhookCheck(): Promise<boolean> {
    try {
      return await this.webhookRecoveryService.ensureWebhookRegistered();
    } catch (err) {
      this.logger.warn(`[RecoveryOrchestrator] Phase 3/4 ERROR: ${(err as Error).message}`);
      return false;
    }
  }

  private phaseComplete(duration: number): RecoveryStatus {
    if (this.consecutiveFailures > 0) {
      this.logger.log(`[RecoveryOrchestrator] Recovered after ${this.consecutiveFailures} failures (${duration}ms)`);
    }
    this.consecutiveFailures = 0;
    this.lastRecoveredAt = new Date().toISOString();
    this.eventEmitter.emit('audit.log', {
      cafeId: '',
      action: 'RECOVERY_CYCLE',
      metadata: { phase: 'complete', ok: true, duration, consecutiveFailures: this.consecutiveFailures },
    });
    this.eventEmitter.emit('openwa.recovered', {
      sessionId: this.openwaSessionService.getSessionId(),
      duration,
      timestamp: this.lastRecoveredAt,
    });
    return this.ok('complete', duration);
  }

  private fail(phase: 'health' | 'session' | 'webhook', duration: number): RecoveryStatus {
    this.consecutiveFailures++;
    this.eventEmitter.emit('audit.log', {
      cafeId: '',
      action: 'RECOVERY_CYCLE',
      metadata: { phase, ok: false, duration, consecutiveFailures: this.consecutiveFailures },
    });
    this.eventEmitter.emit('openwa.recovery.failed', {
      phase,
      duration,
      consecutiveFailures: this.consecutiveFailures,
      timestamp: new Date().toISOString(),
    });
    const errorMsg = `Phase ${phase} failed (${this.consecutiveFailures}x)`;
    this.logger.warn(`[RecoveryOrchestrator] ${errorMsg}`);
    return {
      phase,
      ok: false,
      duration,
      error: errorMsg,
      consecutiveFailures: this.consecutiveFailures,
      lastRecoveredAt: this.lastRecoveredAt,
    };
  }

  private ok(phase: 'complete', duration: number): RecoveryStatus {
    return { phase, ok: true, duration, consecutiveFailures: this.consecutiveFailures, lastRecoveredAt: this.lastRecoveredAt };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
