import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueueService } from '../../queue/queue.service';

@Injectable()
export class InventoryCacheService implements OnModuleInit {
  private readonly logger = new Logger(InventoryCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
  ) {}

  async onModuleInit() {
    await this.initializeCache();
  }

  async getStock(inventoryId: string, branchId: string): Promise<number> {
    const client = this.redisService.getClient();
    if (!client) return 0;
    try {
      const val = await client.hget(`inventory:${branchId}`, inventoryId);
      return val ? parseInt(val, 10) : 0;
    } catch (err) {
      this.logger.warn(`Redis getStock failed for ${inventoryId} in branch ${branchId}: ${(err as Error).message}`);
      return 0;
    }
  }

  async setStock(inventoryId: string, branchId: string, quantity: number): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    try {
      await client.hset(`inventory:${branchId}`, inventoryId, Math.round(quantity).toString());
    } catch (err) {
      this.logger.warn(`Redis setStock failed: ${(err as Error).message}`);
    }
  }

  async updateStock(inventoryId: string, branchId: string, delta: number): Promise<number> {
    const client = this.redisService.getClient();
    if (!client) {
      // Fallback: update in DB directly
      const item = await this.prisma.inventory.update({
        where: { id: inventoryId },
        data: { currentQty: { increment: delta } },
      });
      return Number(item.currentQty);
    }

    try {
      const newQuantity = await client.hincrby(
        `inventory:${branchId}`,
        inventoryId,
        Math.round(delta),
      );

      // Check minimum threshold and trigger alert
      const ingredient = await this.prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: { minThreshold: true, itemName: true },
      });

      if (ingredient && newQuantity <= Number(ingredient.minThreshold)) {
        await this.queueService.addNotificationJob('LOW_STOCK', {
          inventoryId,
          branchId,
          itemName: ingredient.itemName,
          currentQuantity: newQuantity,
          minimumLevel: Number(ingredient.minThreshold),
        });
      }

      return newQuantity;
    } catch (err) {
      this.logger.warn(`Redis updateStock failed: ${(err as Error).message}`);
      // Fallback
      const item = await this.prisma.inventory.update({
        where: { id: inventoryId },
        data: { currentQty: { increment: delta } },
      });
      return Number(item.currentQty);
    }
  }

  async invalidateStock(inventoryId: string, branchId: string): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    try {
      await client.hdel(`inventory:${branchId}`, inventoryId);
    } catch (err) {
      this.logger.warn(`Redis invalidateStock failed: ${(err as Error).message}`);
    }
  }

  async initializeCache(): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) {
      this.logger.warn('Redis client is not available. Skipping inventory cache initialization.');
      return;
    }

    try {
      const items = await this.prisma.inventory.findMany();
      
      // Group by branchId
      const branchGroups = new Map<string, Array<{ id: string; qty: number }>>();
      for (const item of items) {
        const qty = Math.round(Number(item.currentQty));
        const list = branchGroups.get(item.branchId) || [];
        list.push({ id: item.id, qty });
        branchGroups.set(item.branchId, list);
      }

      // Initialize hash for each branch
      let initializedCount = 0;
      for (const [branchId, list] of branchGroups.entries()) {
        const key = `inventory:${branchId}`;
        // Clear existing key
        await client.del(key);
        
        const hashData: Record<string, string> = {};
        for (const entry of list) {
          hashData[entry.id] = entry.qty.toString();
        }
        
        await client.hset(key, hashData);
        initializedCount++;
        this.logger.log(`Initialized inventory cache for branch ${branchId} with ${list.length} items.`);
      }

      this.logger.log(`Inventory cache initialization complete. Seeded ${initializedCount} branches.`);
    } catch (err) {
      this.logger.error(`Failed to initialize inventory cache: ${(err as Error).message}`);
    }
  }
}




