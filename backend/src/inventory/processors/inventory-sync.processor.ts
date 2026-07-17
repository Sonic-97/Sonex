import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface InventorySyncJob {
  ingredientId: string; // matches prompt's payload key
  branchId: string;
  quantityUsed: number;
  orderId: string;
  timestamp: number;
}

@Processor('inventory-sync', { concurrency: 10 })
@Injectable()
export class InventorySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(InventorySyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<InventorySyncJob>): Promise<any> {
    const { ingredientId, branchId, quantityUsed, orderId } = job.data;
    this.logger.log(`Processing inventory sync job ${job.id} for ingredient ${ingredientId} in branch ${branchId}`);

    try {
      await this.prisma.$transaction(async (tx) => {
        // Update PostgreSQL Inventory quantity
        // Note: ingredientId maps to inventoryId in the Inventory model
        const inventory = await tx.inventory.findFirst({
          where: { id: ingredientId, branchId },
        });

        if (!inventory) {
          throw new Error(`Inventory item not found: id=${ingredientId}, branchId=${branchId}`);
        }

        const quantityToDeduct = new Prisma.Decimal(quantityUsed);
        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            currentQty: {
              decrement: quantityToDeduct,
            },
          },
        });

        // Create InventorySyncLog entry
        await tx.inventorySyncLog.create({
          data: {
            cafeId: inventory.cafeId,
            inventoryId: inventory.id,
            branchId,
            orderId,
            change: -Math.round(quantityUsed),
            status: 'synced',
          } as any,
        });
      });

      this.logger.log(`Successfully synced stock for ingredient ${ingredientId} (deducted ${quantityUsed})`);
      return { success: true };
    } catch (err) {
      this.logger.error(`Failed to sync inventory job ${job.id}: ${(err as Error).message}`);
      
      // Check attempt count
      if (job.attemptsMade >= (job.opts.attempts || 5) - 1) {
        // Final failure: log with status: 'failed'
        try {
          const inventory = await this.prisma.inventory.findUnique({ where: { id: ingredientId }, select: { cafeId: true } });
          await this.prisma.inventorySyncLog.create({
            data: {
              cafeId: inventory?.cafeId ?? '',
              inventoryId: ingredientId,
              branchId,
              orderId,
              change: -Math.round(quantityUsed),
              status: 'failed',
              error: (err as Error).message,
            } as any,
          });
        } catch (logErr) {
          this.logger.error(`Failed to log sync failure to DB: ${(logErr as Error).message}`);
        }
      }

      throw err;
    }
  }
}




