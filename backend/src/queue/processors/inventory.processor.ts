import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../queue.config';
import { QueueService } from '../queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { TenantContextService } from '../../common/tenant-context.service';
import { Prisma } from '@prisma/client';

@Processor(QUEUE_NAMES.INVENTORY, { concurrency: 3 })
export class InventoryProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryProcessor.name);
  private readonly LOW_STOCK_THRESHOLD = 20;

  constructor(
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const { cafeId } = job.data as { cafeId?: string };
    const execute = () => {
      switch (job.name) {
        case 'deduct-stock':
          return this.handleDeductStock(job);
        case 'restock':
          return this.handleRestock(job);
        case 'check-thresholds':
          return this.handleCheckThresholds(job);
        default:
          this.logger.warn(`Unknown inventory job: ${job.name}`);
          return { error: `Unknown job: ${job.name}` };
      }
    };
    try {
      return cafeId ? TenantContextService.run(cafeId, execute) : execute();
    } catch (err) {
      this.logger.error(`Inventory job ${job.id} failed: ${(err as Error).message}`);
      if (job.attemptsMade >= (job.opts?.attempts ?? 3) - 1) {
        await this.queueService.sendToDeadLetter(QUEUE_NAMES.INVENTORY, {
          name: job.name,
          data: job.data,
          error: (err as Error).message,
        });
      }
      throw err;
    }
  }

  private async handleDeductStock(job: Job<Record<string, unknown>>) {
    const { inventoryId, quantity, reason } = job.data as {
      inventoryId: string;
      quantity: number;
      reason: string;
    };

    const item = await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: { currentQty: { decrement: new Prisma.Decimal(quantity) } },
    });

    this.logger.log(`Stock deducted: ${item.itemName} (-${quantity}), remaining: ${item.currentQty}`);

    if (Number(item.currentQty) < this.LOW_STOCK_THRESHOLD) {
      this.eventsService.emit('inventory.low', {
        inventoryId: item.id,
        itemName: item.itemName,
        currentQty: Number(item.currentQty),
        threshold: this.LOW_STOCK_THRESHOLD,
      });
    }

    return { inventoryId, remaining: Number(item.currentQty) };
  }

  private async handleRestock(job: Job<Record<string, unknown>>) {
    const { inventoryId, quantity, cost } = job.data as {
      inventoryId: string;
      quantity: number;
      cost?: number;
    };

    const item = await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: { currentQty: { increment: new Prisma.Decimal(quantity) } },
    });

    this.logger.log(`Restocked: ${item.itemName} (+${quantity}), new total: ${item.currentQty}`);

    this.eventsService.emit('inventory.restocked', {
      inventoryId: item.id,
      itemName: item.itemName,
      newQty: Number(item.currentQty),
      added: quantity,
    });

    return { inventoryId, newQty: Number(item.currentQty) };
  }

  private async handleCheckThresholds(job: Job<Record<string, unknown>>) {
    const { inventoryId } = job.data as { inventoryId?: string };

    const where = inventoryId ? { id: inventoryId } : {};
    const items = await this.prisma.inventory.findMany({ where });

    const lowStockItems = items.filter((i) => Number(i.currentQty) < this.LOW_STOCK_THRESHOLD);

    for (const item of lowStockItems) {
      this.eventsService.emit('inventory.low', {
        inventoryId: item.id,
        itemName: item.itemName,
        currentQty: Number(item.currentQty),
        threshold: this.LOW_STOCK_THRESHOLD,
      });
    }

    return { checked: items.length, lowStock: lowStockItems.length };
  }
}




