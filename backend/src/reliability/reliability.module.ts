import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { LidMappingModule } from '../lid-mapping/lid-mapping.module';
import { LidResolverModule } from '../lid-resolver/lid-resolver.module';
import { PendingReplyModule } from '../pending-reply/pending-reply.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { QueueModule } from '../queue/queue.module';
import { HealthCheckService } from './health-check.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { WebhookRecoveryService } from './webhook-recovery.service';
import { PendingReplyScheduler } from './pending-reply-scheduler.service';
import { RetryPolicyService } from './retry-policy.service';
import { DeadLetterService } from './dead-letter.service';
import { OpenwaSessionService } from './openwa-session.service';
import { SessionRecoveryOrchestrator } from './session-recovery-orchestrator.service';
import { OpenwaMetricsService } from './openwa-metrics.service';
import { OpenwaAlertService } from './openwa-alert.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    LidMappingModule,
    LidResolverModule,
    PendingReplyModule,
    WhatsappModule,
    QueueModule,
  ],
  providers: [
    HealthCheckService,
    CircuitBreakerService,
    WebhookRecoveryService,
    PendingReplyScheduler,
    RetryPolicyService,
    DeadLetterService,
    OpenwaSessionService,
    SessionRecoveryOrchestrator,
    OpenwaMetricsService,
    OpenwaAlertService,
  ],
  exports: [
    HealthCheckService,
    CircuitBreakerService,
    WebhookRecoveryService,
    RetryPolicyService,
    DeadLetterService,
    OpenwaSessionService,
    SessionRecoveryOrchestrator,
    OpenwaMetricsService,
    OpenwaAlertService,
  ],
})
export class ReliabilityModule {}
