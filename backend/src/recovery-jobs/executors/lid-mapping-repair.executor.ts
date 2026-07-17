import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LidMappingService } from '../../lid-mapping/lid-mapping.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { RedisService } from '../../redis/redis.service';
import { RecoveryJobExecutor, RecoveryJobScheduler } from '../recovery-jobs.scheduler';
import { RECOVERY_JOB_NAMES, JobResult } from '../recovery-jobs.constants';
import { ReplyRouterService } from '../../reply-router/reply-router.service';

@Injectable()
export class LidMappingRepairExecutor implements RecoveryJobExecutor {
  readonly jobName = RECOVERY_JOB_NAMES.LID_MAPPING_REPAIR;
  private readonly logger = new Logger(LidMappingRepairExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lidMappingService: LidMappingService,
    private readonly whatsappService: WhatsappService,
    private readonly redisService: RedisService,
    private readonly replyRouter: ReplyRouterService,
    scheduler: RecoveryJobScheduler,
  ) {
    scheduler.register(this);
  }

  async run(): Promise<JobResult> {
    const client = this.redisService.getClient();
    const schedulerLock = 'scheduler:lid-mapping-repair:lock';
    if (client) {
      const acquired = await client.set(schedulerLock, '1', 'PX', 295_000, 'NX');
      if (!acquired) {
        this.logger.debug('[LidMappingRepair] Another instance is processing');
        return { ok: true, duration: 0, processed: 0 };
      }
    }

    try {
      const processed = await this.repairMappings();
      return { ok: true, duration: 0, processed };
    } finally {
      if (client) {
        await client.del(schedulerLock).catch(() => {});
      }
    }
  }

  private async repairMappings(): Promise<number> {
    // Find all customers where phoneJid is null but lidJid is present
    const customers = await this.prisma.customer.findMany({
      where: {
        phoneJid: null,
        lidJid: { not: null },
      },
      take: 100,
    });

    if (customers.length === 0) return 0;
    this.logger.log(`[LidMappingRepair] Found ${customers.length} customers to check/repair.`);

    let repairedCount = 0;

    for (const customer of customers) {
      if (!customer.lidJid) continue;
      
      let attempts = 0;
      let resolvedPhone: string | null = null;

      while (attempts < 3) {
        try {
          resolvedPhone = await this.whatsappService.getContactPhone(customer.lidJid);
          if (resolvedPhone) {
            break;
          }
        } catch (err) {
          this.logger.warn(`[LidMappingRepair] Attempt ${attempts + 1} failed for ${customer.lidJid}: ${(err as Error).message}`);
        }
        attempts++;
        if (!resolvedPhone && attempts < 3) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (resolvedPhone) {
        try {
          await this.prisma.$transaction(async (tx) => {
            const phoneJid = `${resolvedPhone}@c.us`;

            // 1. Upsert LidMapping
            await tx.lidMapping.upsert({
              where: { cafeId_lid: { cafeId: customer.cafeId, lid: customer.lidJid! } },
              create: {
                lid: customer.lidJid!,
                phone: resolvedPhone!,
                phoneJid,
                source: 'recovery_job',
                cafeId: customer.cafeId,
              },
              update: {
                phone: resolvedPhone!,
                phoneJid,
                source: 'recovery_job',
                lastSeenAt: new Date(),
              },
            });

            this.logger.log(JSON.stringify({
              event: 'TRACE_LID_MAPPING_UPSERT',
              traceId: 'repair-job',
              cafeId: customer.cafeId,
              lid: customer.lidJid,
              phone: resolvedPhone,
            }));

            // 2. Repair customer record
            await tx.customer.update({
              where: { id: customer.id },
              data: {
                phone: resolvedPhone!,
                phoneJid,
                lastKnownJid: phoneJid,
                lastResolvedAt: new Date(),
              },
            });

            this.logger.log(JSON.stringify({
              event: 'TRACE_CUSTOMER_REPAIRED',
              traceId: 'repair-job',
              cafeId: customer.cafeId,
              customerId: customer.id,
              lid: customer.lidJid,
              phone: resolvedPhone,
            }));
          });

          this.replyRouter.sonicLidMappingRepairsTotal.inc({ cafe_id: customer.cafeId });
          repairedCount++;
        } catch (err) {
          this.logger.error(`[LidMappingRepair] Failed to repair customer ${customer.id}: ${(err as Error).message}`);
          this.replyRouter.sonicLidResolutionFailuresTotal.inc({ cafe_id: customer.cafeId });
        }
      } else {
        this.replyRouter.sonicLidResolutionFailuresTotal.inc({ cafe_id: customer.cafeId });
      }
    }

    return repairedCount;
  }
}
