import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/decorators';
import { HealthIndicatorsService } from '../health/health-indicators.service';
import { MetricsService } from '../metrics/metrics.service';
import { AlertManagerService } from '../alerts/alert-manager.service';

@Controller('health')
export class HealthDashboardController {
  private readonly startTime = Date.now();

  constructor(
    private readonly health: HealthIndicatorsService,
    private readonly metrics: MetricsService,
    private readonly alerts: AlertManagerService,
  ) {}

  @Public()
  @Get('dashboard')
  async dashboard() {
    const healthResult = await this.health.checkAll();
    const registry = this.metrics.registry;

    const getValue = async (gauge: string, labels?: Record<string, string>) => {
      try {
        const metric = await registry.getSingleMetric(gauge);
        if (!metric) return 0;
        const m = await metric.get();
        if (!m || !('values' in m)) return 0;
        const values = m as { values: Array<{ labels: Record<string, string>; value: number }> };
        if (labels && values.values) {
          const match = values.values.find((v) =>
            Object.entries(labels).every(([k, val]) => v.labels[k] === val),
          );
          return match?.value ?? 0;
        }
        return values.values?.[0]?.value ?? 0;
      } catch {
        return 0;
      }
    };

    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      health: healthResult,
      recentAlerts: this.alerts.getRecentAlerts(10),
      timestamp: new Date().toISOString(),
    };
  }
}
