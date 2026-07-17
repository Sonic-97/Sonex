import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RecoveryJobExecutor, RecoveryJobScheduler } from '../recovery-jobs.scheduler';
import { RECOVERY_JOB_NAMES, JobResult } from '../recovery-jobs.constants';

@Injectable()
export class CustomerMergeExecutor implements RecoveryJobExecutor {
  readonly jobName = RECOVERY_JOB_NAMES.CUSTOMER_MERGE;
  private readonly logger = new Logger(CustomerMergeExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    scheduler: RecoveryJobScheduler,
  ) {
    scheduler.register(this);
  }

  async run(): Promise<JobResult> {
    const start = Date.now();
    const cafes = await this.prisma.cafe.findMany({
      select: { id: true },
      where: { active: true },
    });

    let total = 0;
    for (const cafe of cafes) {
      const merged = await this.mergeCafeCustomers(cafe.id);
      total += merged;
    }

    return { ok: true, duration: Date.now() - start, processed: total };
  }

  private async mergeCafeCustomers(cafeId: string): Promise<number> {
    const duplicates = await this.prisma.customer.groupBy({
      by: ['phone'],
      where: { cafeId },
      having: { phone: { _count: { gt: 1 } } },
    });

    let merged = 0;
    for (const { phone } of duplicates) {
      const customers = await this.prisma.customer.findMany({
        where: { cafeId, phone },
        orderBy: [{ totalOrders: 'desc' }, { totalSpent: 'desc' }],
      });

      if (customers.length < 2) continue;

      const [keep, ...remove] = customers;
      const idsToRemove = remove.map(c => c.id);

      await this.prisma.$transaction(async (tx) => {
        await tx.order.updateMany({
          where: { customerId: { in: idsToRemove } },
          data: { customerId: keep.id },
        });
        await tx.inCafeOrder.updateMany({
          where: { customerId: { in: idsToRemove } },
          data: { customerId: keep.id },
        });
        await tx.debt.updateMany({
          where: { customerId: { in: idsToRemove } },
          data: { customerId: keep.id },
        });

        await tx.customer.deleteMany({
          where: { id: { in: idsToRemove } },
        });
      });

      const totalOrders = customers.reduce((s, c) => s + c.totalOrders, 0);
      const totalSpent = customers.reduce((s, c) => s + c.totalSpent.toNumber(), 0);
      await this.prisma.customer.update({
        where: { id: keep.id },
        data: { totalOrders, totalSpent },
      });

      await this.auditService.log({
        cafeId,
        action: 'CUSTOMER_MERGE',
        entityType: 'Customer',
        entityId: keep.id,
        metadata: { mergedCustomerIds: idsToRemove, keptCustomerId: keep.id, mergedCount: idsToRemove.length },
      });

      merged += idsToRemove.length;
      this.logger.log(`[CustomerMerge] Merged ${idsToRemove.length} duplicates for phone ${phone} in cafe ${cafeId}`);
    }

    return merged;
  }
}
