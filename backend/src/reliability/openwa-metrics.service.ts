import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as promClient from 'prom-client';
import { OpenwaSessionState } from './openwa-session.service';
import { MetricsService } from '../observability/metrics/metrics.service';

const STATE_VALUE: Record<OpenwaSessionState, number> = {
  [OpenwaSessionState.UNKNOWN]: 0,
  [OpenwaSessionState.UNHEALTHY]: 1,
  [OpenwaSessionState.CONNECTING]: 2,
  [OpenwaSessionState.REGISTERING]: 3,
  [OpenwaSessionState.CONNECTED]: 4,
};

@Injectable()
export class OpenwaMetricsService {
  private readonly logger = new Logger(OpenwaMetricsService.name);

  private readonly sessionState: promClient.Gauge<string>;
  private readonly recoveryAttempts: promClient.Counter<string>;
  private readonly recoveryDuration: promClient.Histogram<string>;
  private readonly sessionReconnects: promClient.Counter<string>;
  private readonly webhookRegistrations: promClient.Counter<string>;
  private readonly consecutiveFailures: promClient.Gauge<string>;

  constructor(private readonly mainMetrics: MetricsService) {
    this.sessionState = new promClient.Gauge({
      name: 'openwa_session_state',
      help: 'Current OpenWA session state (0=unknown, 1=unhealthy, 2=connecting, 3=registering, 4=connected)',
      labelNames: ['state'],
      registers: [mainMetrics.registry],
    });

    this.recoveryAttempts = new promClient.Counter({
      name: 'openwa_recovery_attempts_total',
      help: 'Total recovery phase attempts',
      labelNames: ['phase', 'result'],
      registers: [mainMetrics.registry],
    });

    this.recoveryDuration = new promClient.Histogram({
      name: 'openwa_recovery_duration_seconds',
      help: 'Duration of recovery pipeline phases',
      labelNames: ['phase'],
      buckets: [1, 5, 15, 30, 60, 120],
      registers: [mainMetrics.registry],
    });

    this.sessionReconnects = new promClient.Counter({
      name: 'openwa_session_reconnects_total',
      help: 'Total session reconnect attempts',
      labelNames: ['result'],
      registers: [mainMetrics.registry],
    });

    this.webhookRegistrations = new promClient.Counter({
      name: 'openwa_webhook_registrations_total',
      help: 'Total webhook registration attempts',
      labelNames: ['result'],
      registers: [mainMetrics.registry],
    });

    this.consecutiveFailures = new promClient.Gauge({
      name: 'openwa_consecutive_failures',
      help: 'Current consecutive recovery failures',
      registers: [mainMetrics.registry],
    });

    this.sessionState.set({ state: OpenwaSessionState.UNKNOWN }, STATE_VALUE[OpenwaSessionState.UNKNOWN]);
  }

  setSessionState(state: OpenwaSessionState): void {
    this.sessionState.set({ state }, STATE_VALUE[state]);
  }

  incrementRecoveryAttempt(phase: string, result: 'success' | 'failure'): void {
    this.recoveryAttempts.inc({ phase, result });
  }

  observeRecoveryDuration(phase: string, durationMs: number): void {
    this.recoveryDuration.observe({ phase }, durationMs / 1000);
  }

  incrementReconnect(result: 'success' | 'failure'): void {
    this.sessionReconnects.inc({ result });
  }

  incrementWebhookRegistration(result: 'success' | 'failure'): void {
    this.webhookRegistrations.inc({ result });
  }

  setConsecutiveFailures(count: number): void {
    this.consecutiveFailures.set(count);
  }

  @OnEvent('openwa.state.changed')
  handleStateChanged(payload: { to: string }): void {
    const state = payload.to as OpenwaSessionState;
    if (STATE_VALUE[state] !== undefined) {
      this.setSessionState(state);
      const isConnected = state === OpenwaSessionState.CONNECTED ? 1 : 0;
      this.mainMetrics.sessionHealth.set({ type: 'openwa', state }, isConnected);
      this.mainMetrics.webhookHealth.set({ webhook: 'openwa' }, 1);
    }
  }

  @OnEvent('openwa.recovery.failed')
  handleRecoveryFailed(payload: { phase: string; duration: number; consecutiveFailures: number }): void {
    this.incrementRecoveryAttempt(payload.phase, 'failure');
    this.observeRecoveryDuration(payload.phase, payload.duration);
    this.setConsecutiveFailures(payload.consecutiveFailures);
    this.mainMetrics.sessionHealth.set({ type: 'openwa', state: 'recovery_failed' }, 0);
  }

  @OnEvent('openwa.recovered')
  handleRecovered(payload: { duration: number }): void {
    this.incrementRecoveryAttempt('all', 'success');
    this.observeRecoveryDuration('all', payload.duration);
    this.setConsecutiveFailures(0);
    this.mainMetrics.sessionHealth.set({ type: 'openwa', state: 'recovered' }, 1);
    this.mainMetrics.webhookHealth.set({ webhook: 'openwa' }, 1);
  }

  @OnEvent('openwa.session.reconnected')
  handleReconnected(): void {
    this.incrementReconnect('success');
  }

  @OnEvent('openwa.session.created')
  handleSessionCreated(): void {
    this.incrementReconnect('success');
  }
}
