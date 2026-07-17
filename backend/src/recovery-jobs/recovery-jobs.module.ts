import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { LidMappingModule } from '../lid-mapping/lid-mapping.module';
import { LidResolverModule } from '../lid-resolver/lid-resolver.module';
import { PendingReplyModule } from '../pending-reply/pending-reply.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ReplyRouterModule } from '../reply-router/reply-router.module';
import { RecoveryJobScheduler } from './recovery-jobs.scheduler';
import { RecoveryJobsMetricsService } from './recovery-jobs.metrics.service';
import { PendingReplyExecutor } from './executors/pending-reply.executor';
import { WebhookVerifyExecutor } from './executors/webhook-verify.executor';
import { SessionVerifyExecutor } from './executors/session-verify.executor';
import { CustomerMergeExecutor } from './executors/customer-merge.executor';
import { InventoryReconcileExecutor } from './executors/inventory-reconcile.executor';
import { DeadLetterExecutor } from './executors/dead-letter.executor';
import { LidMappingRepairExecutor } from './executors/lid-mapping-repair.executor';

@Global()
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    LidMappingModule,
    LidResolverModule,
    PendingReplyModule,
    WhatsappModule,
    ReplyRouterModule,
  ],
  providers: [
    RecoveryJobScheduler,
    RecoveryJobsMetricsService,
    PendingReplyExecutor,
    WebhookVerifyExecutor,
    SessionVerifyExecutor,
    CustomerMergeExecutor,
    InventoryReconcileExecutor,
    DeadLetterExecutor,
    LidMappingRepairExecutor,
  ],
  exports: [
    RecoveryJobScheduler,
    RecoveryJobsMetricsService,
  ],
})
export class RecoveryJobsModule {}
