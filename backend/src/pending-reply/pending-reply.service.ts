import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PendingReplyCreateInput {
  lid: string;
  message: string;
  cafeId: string;
}

export interface PendingReplyResult {
  id: string;
  lid: string;
  message: string;
  status: string;
  cafeId: string;
}

@Injectable()
export class PendingReplyService {
  private readonly logger = new Logger(PendingReplyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: PendingReplyCreateInput): Promise<PendingReplyResult> {
    const cleanLid = input.lid.includes('@lid') ? input.lid : `${input.lid}@lid`;
    const record = await this.prisma.pendingReply.create({
      data: {
        lid: cleanLid,
        message: input.message,
        status: 'pending',
        cafeId: input.cafeId,
      },
    });
    this.logger.warn(`[UnresolvedLidWarning] Created PendingReply ${record.id} for LID ${cleanLid} — message length=${input.message.length}`);
    return {
      id: record.id,
      lid: record.lid,
      message: record.message,
      status: record.status,
      cafeId: record.cafeId,
    };
  }

  async findPendingByLid(lid: string, cafeId: string): Promise<PendingReplyResult[]> {
    const cleanLid = lid.includes('@lid') ? lid : `${lid}@lid`;
    const records = await this.prisma.pendingReply.findMany({
      where: { lid: cleanLid, status: 'pending', cafeId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(r => ({
      id: r.id,
      lid: r.lid,
      message: r.message,
      status: r.status,
      cafeId: r.cafeId,
    }));
  }

  async retryForLid(
    lid: string,
    sendFn: (message: string, phoneJid: string) => Promise<boolean>,
    cafeId: string,
  ): Promise<number> {
    const pending = await this.findPendingByLid(lid, cafeId);
    let sentCount = 0;

    for (const item of pending) {
      this.logger.log(`[PendingReply Retry] Attempting to send pending reply ${item.id} for LID ${lid}`);
      const success = await sendFn(item.message, item.lid);
      if (success) {
        await this.prisma.pendingReply.update({
          where: { id: item.id },
          data: { status: 'resolved', resolvedAt: new Date() },
        });
        sentCount++;
      }
    }

    if (sentCount > 0) {
      this.logger.log(`[PendingReply Retry] Resolved ${sentCount}/${pending.length} pending replies for LID ${lid}`);
    }
    return sentCount;
  }

  async retryAll(
    sendFn: (message: string, phoneJid: string) => Promise<boolean>,
    lidFilter?: string,
    cafeId?: string,
  ): Promise<number> {
    const where: any = { status: 'pending' };
    if (cafeId) where.cafeId = cafeId;
    if (lidFilter) {
      where.lid = lidFilter.includes('@lid') ? lidFilter : `${lidFilter}@lid`;
    }
    const records = await this.prisma.pendingReply.findMany({ where, orderBy: { createdAt: 'asc' } });
    let totalSent = 0;

    for (const item of records) {
      const success = await sendFn(item.message, item.lid);
      if (success) {
        await this.prisma.pendingReply.update({
          where: { id: item.id },
          data: { status: 'resolved', resolvedAt: new Date() },
        });
        totalSent++;
      }
    }

    this.logger.log(`[PendingReply Retry All] Resolved ${totalSent}/${records.length} pending replies`);
    return totalSent;
  }

  async markAllExpiredForLid(lid: string, cafeId: string): Promise<number> {
    const cleanLid = lid.includes('@lid') ? lid : `${lid}@lid`;
    const result = await this.prisma.pendingReply.updateMany({
      where: { lid: cleanLid, status: 'pending', cafeId },
      data: { status: 'expired' },
    });
    return result.count;
  }
}
