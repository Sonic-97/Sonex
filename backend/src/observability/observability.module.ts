import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { HealthIndicatorsService } from './health/health-indicators.service';
import { MetricsService } from './metrics/metrics.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { AlertManagerService } from './alerts/alert-manager.service';
import { HealthDashboardController } from './dashboard/health-dashboard.controller';
import { CorrelationIdMiddleware } from './logger/correlation-id.middleware';
import { RequestLoggingInterceptor } from './logger/request-logging.interceptor';
import { PinoLoggerService } from './logger/pino-logger.service';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ConfigurationService } from './configuration/configuration.service';
import { GracefulShutdownService } from './shutdown/graceful-shutdown.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController, MetricsController, HealthDashboardController],
  providers: [
    HealthIndicatorsService,
    MetricsService,
    AlertManagerService,
    PinoLoggerService,
    RequestLoggingInterceptor,
    ConfigurationService,
    GracefulShutdownService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [
    MetricsService,
    PinoLoggerService,
    AlertManagerService,
    HealthIndicatorsService,
    ConfigurationService,
  ],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
