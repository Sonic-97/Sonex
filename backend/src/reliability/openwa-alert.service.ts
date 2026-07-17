import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { OpenwaSessionState } from './openwa-session.service';

interface AlertState {
  consecutiveFailures: number;
  lastUnhealthyAt: number | null;
  recoveryFailedCount: number;
  webhookFailedCount: number;
  lastAlertedAt: number | null;
}

const CRITICAL_FAILURE_THRESHOLD = 3;
const UNHEALTHY_DURATION_MS = 5 * 60 * 1000;
const ALERT_COOLDOWN_MS = 60_000;

@Injectable()
export class OpenwaAlertService implements OnModuleInit {
  private readonly logger = new Logger(OpenwaAlertService.name);
  private state: AlertState = {
    consecutiveFailures: 0,
    lastUnhealthyAt: null,
    recoveryFailedCount: 0,
    webhookFailedCount: 0,
    lastAlertedAt: null,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  onModuleInit() {
    setInterval(() => {
      this.checkUnhealthyDuration().catch(err => {
        this.logger.error(`[OpenwaAlert] Unhealthy check failed: ${(err as Error).message}`);
      });
    }, 30_000).unref();
  }

  @OnEvent('openwa.state.changed')
  async handleStateChanged(payload: { from: string; to: string; error?: string }): Promise<void> {
    if (payload.to === OpenwaSessionState.UNHEALTHY || payload.to === OpenwaSessionState.UNKNOWN) {
      if (!this.state.lastUnhealthyAt) {
        this.state.lastUnhealthyAt = Date.now();
      }
    } else if (payload.to === OpenwaSessionState.CONNECTED) {
      this.state.lastUnhealthyAt = null;
    }
  }

  @OnEvent('openwa.recovery.failed')
  async handleRecoveryFailed(payload: { phase: string; consecutiveFailures: number }): Promise<void> {
    this.state.consecutiveFailures = payload.consecutiveFailures;
    this.state.recoveryFailedCount++;

    if (payload.phase === 'webhook') {
      this.state.webhookFailedCount++;
      this.logger.warn(`[WEBHOOK_ERROR] Webhook registration failed (${this.state.webhookFailedCount}x)`);
    }

    if (payload.consecutiveFailures >= CRITICAL_FAILURE_THRESHOLD) {
      await this.emitCritical('RECOVERY_FAILED', `Recovery failed ${payload.consecutiveFailures}x in a row (phase: ${payload.phase})`);
    }
  }

  @OnEvent('openwa.recovered')
  async handleRecovered(payload: { sessionId: string; duration: number }): Promise<void> {
    const wasCritical = this.state.consecutiveFailures >= CRITICAL_FAILURE_THRESHOLD;
    this.resetState();
    if (wasCritical) {
      await this.emitRecovered(payload.sessionId, payload.duration);
    }
  }

  @OnEvent('openwa.session.created')
  handleSessionCreated(payload: { sessionId: string }): void {
    this.logger.log(`[OPENWA_SESSION_CREATED] New session: ${payload.sessionId}`);
  }

  @OnEvent('openwa.session.reconnected')
  handleReconnected(): void {
    this.state.lastUnhealthyAt = null;
  }

  async checkUnhealthyDuration(): Promise<void> {
    if (!this.state.lastUnhealthyAt) return;
    const elapsed = Date.now() - this.state.lastUnhealthyAt;
    if (elapsed >= UNHEALTHY_DURATION_MS) {
      await this.emitCritical('SESSION_DOWN', `Session unhealthy for ${Math.floor(elapsed / 1000)}s`);
    }
  }

  private async emitCritical(type: string, message: string): Promise<void> {
    const now = Date.now();
    if (this.state.lastAlertedAt && now - this.state.lastAlertedAt < ALERT_COOLDOWN_MS) return;
    this.state.lastAlertedAt = now;

    this.logger.error(`[OPENWA_CRITICAL] ${type}: ${message}`);

    try {
      const cafes = await this.prisma.cafe.findMany({
        select: { id: true },
        where: { active: true },
      });
      for (const cafe of cafes) {
        this.eventsService.emitToOwner('openwa.alert.critical', {
          type,
          message,
          consecutiveFailures: this.state.consecutiveFailures,
          timestamp: new Date().toISOString(),
        }, cafe.id);
      }
    } catch (err) {
      this.logger.error(`[OpenwaAlert] Failed to broadcast critical alert: ${(err as Error).message}`);
    }
  }

  private async emitRecovered(sessionId: string, duration: number): Promise<void> {
    this.logger.log(`[OPENWA_RECOVERED] Session ${sessionId} back online (downtime: ${duration}ms)`);

    try {
      const cafes = await this.prisma.cafe.findMany({
        select: { id: true },
        where: { active: true },
      });
      for (const cafe of cafes) {
        this.eventsService.emitToOwner('openwa.alert.recovered', {
          sessionId,
          duration,
          timestamp: new Date().toISOString(),
        }, cafe.id);
      }
    } catch (err) {
      this.logger.error(`[OpenwaAlert] Failed to broadcast recovery: ${(err as Error).message}`);
    }
  }

  private resetState(): void {
    this.state.consecutiveFailures = 0;
    this.state.lastUnhealthyAt = null;
    this.state.recoveryFailedCount = 0;
    this.state.webhookFailedCount = 0;
  }
}
