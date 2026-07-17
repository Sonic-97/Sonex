import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

import { TenantContextService } from '../common/tenant-context.service';

export interface DeadLetterEntry {
  id: string;
  cafeId: string;
  operation: string;
  payload: string;
  error: string;
  attempts: number;
  createdAt: Date;
  status: 'pending_review' | 'replaying' | 'replayed' | 'discarded';
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async record(operation: string, payload: unknown, error: string, attempts: number): Promise<void> {
    const cafeId = TenantContextService.cafeId;
    if (!cafeId) {
      this.logger.warn(`[DLQ] No cafeId in context — cannot record ${operation}`);
      return;
    }
    try {
      await this.prisma.deadLetter.create({
        data: {
          cafeId,
          operation,
          payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
          error,
          attempts,
          status: 'pending_review',
        },
      });
      this.logger.warn(`[DLQ] Recorded ${operation} (cafeId=${cafeId}, attempts=${attempts}): ${error}`);
    } catch (err) {
      this.logger.error(`[DLQ] Failed to record entry: ${(err as Error).message}`);
    }
  }

  async listPending(cafeId?: string): Promise<DeadLetterEntry[]> {
    const where: Record<string, unknown> = { status: 'pending_review' };
    if (cafeId) where.cafeId = cafeId;
    const entries = await this.prisma.deadLetter.findMany({
      where: where as any,
      orderBy: { createdAt: 'asc' },
      take: 100,
    }) as unknown as DeadLetterEntry[];
    return entries;
  }

  async replay(id: string): Promise<boolean> {
    try {
      const entry = await this.prisma.deadLetter.findUnique({ where: { id } }) as unknown as DeadLetterEntry | null;
      if (!entry) return false;

      await this.prisma.deadLetter.update({ where: { id }, data: { status: 'replaying' } });

      const queueMap: Record<string, (data: Record<string, unknown>, opts?: { jobId?: string }) => Promise<any>> = {
        'whatsapp-send': (d) => this.queueService.addWhatsAppJob('dlq-replay', d),
        'webhook-register': (d) => this.queueService.addOrderJob('dlq-webhook-replay', d),
        'inventory-sync': (d) => this.queueService.addInventorySyncJob('dlq-replay', d),
      };

      const fn = queueMap[entry.operation];
      if (fn) {
        const payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;
        await fn(payload, { jobId: `dlq-${entry.id}` });
      }

      await this.prisma.deadLetter.update({ where: { id }, data: { status: 'replayed' } });
      this.logger.log(`[DLQ] Replayed ${entry.operation} (${id})`);
      return true;
    } catch (err) {
      this.logger.error(`[DLQ] Replay failed for ${id}: ${(err as Error).message}`);
      return false;
    }
  }

  async discard(id: string): Promise<boolean> {
    try {
      await this.prisma.deadLetter.update({ where: { id }, data: { status: 'discarded' } });
      return true;
    } catch {
      return false;
    }
  }

  async replayAll(cafeId?: string): Promise<{ replayed: number; failed: number }> {
    const pending = await this.listPending(cafeId);
    let replayed = 0;
    let failed = 0;
    for (const entry of pending) {
      const ok = await this.replay(entry.id);
      if (ok) replayed++; else failed++;
    }
    return { replayed, failed };
  }
}
