import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RecoveryJobExecutor, RecoveryJobScheduler } from '../recovery-jobs.scheduler';
import { RECOVERY_JOB_NAMES, JobResult } from '../recovery-jobs.constants';

@Injectable()
export class InventoryReconcileExecutor implements RecoveryJobExecutor {
  readonly jobName = RECOVERY_JOB_NAMES.INVENTORY_RECONCILE;
  private readonly logger = new Logger(InventoryReconcileExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    scheduler: RecoveryJobScheduler,
  ) {
    scheduler.register(this);
  }

  async run(): Promise<JobResult> {
    const start = Date.now();

    const negativeItems = await this.fixNegativeStock();
    const logCount = await this.logDiscrepancies();

    const total = negativeItems + logCount;
    if (total > 0) {
      this.logger.log(`[InventoryReconcile] Fixed ${negativeItems} negative, logged ${logCount} discrepancies`);
    }
    return { ok: true, duration: Date.now() - start, processed: total };
  }

  private async fixNegativeStock(): Promise<number> {
    const items = await this.prisma.inventory.findMany({
      where: { currentQty: { lt: 0 } },
      select: { id: true, itemName: true, currentQty: true, cafeId: true },
    });

    for (const item of items) {
      await this.prisma.inventory.update({
        where: { id: item.id },
        data: { currentQty: 0 },
      });
      this.logger.warn(`[InventoryReconcile] Reset ${item.itemName} from ${item.currentQty} to 0 (negative stock)`);
    }

    return items.length;
  }

  private async logDiscrepancies(): Promise<number> {
    const items = await this.prisma.inventory.findMany({
      where: { currentQty: { lt: 0 } },
      select: { id: true, cafeId: true, itemName: true, currentQty: true },
    });

    if (items.length > 0) {
      for (const item of items) {
        this.logger.warn(`[InventoryReconcile] Discrepancy: ${item.itemName} (${item.cafeId}) qty=${item.currentQty}`);
      }
    }

    return items.length;
  }
}
