import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LidMappingService } from '../../lid-mapping/lid-mapping.service';
import { LidResolverService } from '../../lid-resolver/lid-resolver.service';
import { PendingReplyService } from '../../pending-reply/pending-reply.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { RedisService } from '../../redis/redis.service';
import { RecoveryJobExecutor, RecoveryJobScheduler } from '../recovery-jobs.scheduler';
import { RECOVERY_JOB_NAMES, JobResult } from '../recovery-jobs.constants';

const PENDING_REPLY_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

@Injectable()
export class PendingReplyExecutor implements RecoveryJobExecutor {
  readonly jobName = RECOVERY_JOB_NAMES.PENDING_REPLY;
  private readonly logger = new Logger(PendingReplyExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lidMappingService: LidMappingService,
    private readonly lidResolverService: LidResolverService,
    private readonly pendingReplyService: PendingReplyService,
    private readonly whatsappService: WhatsappService,
    private readonly redisService: RedisService,
    scheduler: RecoveryJobScheduler,
  ) {
    scheduler.register(this);
  }

  async run(): Promise<JobResult> {
    const client = this.redisService.getClient();
    const schedulerLock = 'scheduler:pending-reply:lock';
    if (client) {
      const acquired = await client.set(schedulerLock, '1', 'PX', 295_000, 'NX');
      if (!acquired) {
        this.logger.debug('[PendingReply] Another instance is processing');
        return { ok: true, duration: 0, processed: 0 };
      }
    }

    try {
      await this.expireOldReplies();
      const processed = await this.processPendingBatch();
      return { ok: true, duration: 0, processed };
    } finally {
      if (client) {
        await client.del(schedulerLock).catch(() => {});
      }
    }
  }

  private async expireOldReplies(): Promise<number> {
    const cutoff = new Date(Date.now() - PENDING_REPLY_MAX_AGE_MS);
    const result = await this.prisma.pendingReply.updateMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      data: { status: 'expired' },
    });
    if (result.count > 0) {
      this.logger.log(`[PendingReply] Expired ${result.count} stale replies`);
    }
    return result.count;
  }

  private async processPendingBatch(): Promise<number> {
    const pending = await this.prisma.pendingReply.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      distinct: ['cafeId', 'lid'],
      select: { cafeId: true, lid: true },
    });

    if (pending.length === 0) return 0;
    this.logger.log(`[PendingReply] Processing ${pending.length} LIDs`);

    let total = 0;
    for (const { cafeId, lid } of pending) {
      if (!cafeId) continue;
      try {
        const count = await this.retrySingleLid(lid, cafeId);
        total += count;
      } catch (err) {
        this.logger.warn(`[PendingReply] Failed for ${lid}: ${(err as Error).message}`);
      }
    }
    return total;
  }

  private async retrySingleLid(lid: string, cafeId: string): Promise<number> {
    const waterfallResult = await this.lidResolverService.resolve(lid, {
      findByLid: (l) => this.lidMappingService.findByLid(l),
      getContactPhone: (j) => this.whatsappService.getContactPhone(j),
      getContactDetails: (j) => this.whatsappService.getContactDetails(j),
      findSessionByLid: () => Promise.resolve(null),
      findCustomerByJid: () => Promise.resolve(null),
    }, cafeId);

    if (!waterfallResult.phoneJid) {
      this.logger.debug(`[PendingReply] ${lid} still unresolved`);
      return 0;
    }

    return this.pendingReplyService.retryForLid(
      lid,
      async (msg) => {
        const result = await this.whatsappService.sendMessage(waterfallResult.phoneJid!, msg);
        return result.success;
      },
      cafeId,
    );
  }
}
