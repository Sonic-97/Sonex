import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LidMappingService } from '../lid-mapping/lid-mapping.service';
import { LidResolverService } from '../lid-resolver/lid-resolver.service';
import { PendingReplyService } from '../pending-reply/pending-reply.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { RedisService } from '../redis/redis.service';

const PENDING_REPLY_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 300_000;
const BATCH_SIZE = 50;

@Injectable()
export class PendingReplyScheduler implements OnModuleInit {
  private readonly logger = new Logger(PendingReplyScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lidMappingService: LidMappingService,
    private readonly lidResolverService: LidResolverService,
    private readonly pendingReplyService: PendingReplyService,
    private readonly whatsappService: WhatsappService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit() {
    const run = () => {
      this.processBatches().catch(err => {
        this.logger.error(`[PendingReplyScheduler] Batch error: ${(err as Error).message}`);
      });
    };
    setTimeout(run, 60_000).unref();
    setInterval(run, RETRY_INTERVAL_MS).unref();
  }

  private async processBatches() {
    const client = this.redisService.getClient();
    const schedulerLock = 'scheduler:pending-reply:lock';
    if (client) {
      const acquired = await client.set(schedulerLock, '1', 'PX', RETRY_INTERVAL_MS - 5000, 'NX');
      if (!acquired) {
        this.logger.debug('[PendingReplyScheduler] Another instance is processing');
        return;
      }
    }

    try {
      await this.expireOldReplies();
      await this.processPendingBatch();
    } finally {
      if (client) {
        await client.del(schedulerLock).catch(() => {});
      }
    }
  }

  private async expireOldReplies() {
    const cutoff = new Date(Date.now() - PENDING_REPLY_MAX_AGE_MS);
    const result = await this.prisma.pendingReply.updateMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      data: { status: 'expired' },
    });
    if (result.count > 0) {
      this.logger.log(`[PendingReplyScheduler] Expired ${result.count} stale pending replies older than 48h`);
    }
  }

  private async processPendingBatch() {
    const pending = await this.prisma.pendingReply.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      distinct: ['cafeId', 'lid'],
      select: { cafeId: true, lid: true },
    });

    if (pending.length === 0) return;

    this.logger.log(`[PendingReplyScheduler] Processing ${pending.length} LIDs with pending replies`);

    for (const { cafeId, lid } of pending) {
      if (!cafeId) continue;
      try {
        await this.retrySingleLid(lid, cafeId);
      } catch (err) {
        this.logger.warn(`[PendingReplyScheduler] Failed for ${lid}: ${(err as Error).message}`);
      }
    }
  }

  private async retrySingleLid(lid: string, cafeId: string) {
    const waterfallResult = await this.lidResolverService.resolve(lid, {
      findByLid: (l) => this.lidMappingService.findByLid(l),
      getContactPhone: (j) => this.whatsappService.getContactPhone(j),
      getContactDetails: (j) => this.whatsappService.getContactDetails(j),
      findSessionByLid: () => Promise.resolve(null),
      findCustomerByJid: () => Promise.resolve(null),
    }, cafeId);

    if (!waterfallResult.phoneJid) {
      this.logger.debug(`[PendingReplyScheduler] ${lid} still unresolved`);
      return;
    }

    const replyCount = await this.pendingReplyService.retryForLid(
      lid,
      async (msg) => {
        const result = await this.whatsappService.sendMessage(waterfallResult.phoneJid!, msg);
        return result.success;
      },
      cafeId,
    );

    if (replyCount > 0) {
      this.logger.log(`[PendingReplyScheduler] Resolved ${replyCount} pending replies for ${lid} via scheduler`);
    }
  }
}
