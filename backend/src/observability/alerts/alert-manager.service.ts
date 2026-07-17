import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface Alert {
  level: 'critical' | 'warning' | 'info';
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const ALERT_COOLDOWN_MS = 60_000;

@Injectable()
export class AlertManagerService {
  private readonly logger = new Logger(AlertManagerService.name);
  private lastAlerted: Map<string, number> = new Map();
  private alerts: Alert[] = [];

  constructor(private readonly eventEmitter: EventEmitter2) {}

  fire(alert: Alert): void {
    const key = `${alert.source}:${alert.message}`;
    const last = this.lastAlerted.get(key);
    const now = Date.now();
    if (last && now - last < ALERT_COOLDOWN_MS) return;
    this.lastAlerted.set(key, now);

    this.alerts.push(alert);
    if (this.alerts.length > 100) this.alerts.shift();

    this.eventEmitter.emit('system.alert', alert);

    if (alert.level === 'critical') {
      this.logger.error(`[ALERT][${alert.source}] ${alert.message}`);
    } else if (alert.level === 'warning') {
      this.logger.warn(`[ALERT][${alert.source}] ${alert.message}`);
    } else {
      this.logger.log(`[ALERT][${alert.source}] ${alert.message}`);
    }
  }

  getRecentAlerts(limit = 20): Alert[] {
    return this.alerts.slice(-limit);
  }
}
