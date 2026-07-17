import { Injectable, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

export interface IdempotencyResult {
  duplicated: boolean;
  entityType?: string;
  entityId?: string;
}

export type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async isProcessed(
    source: string,
    idempotencyKey: string,
    cafeId?: string,
  ): Promise<IdempotencyResult> {
    const where: Record<string, unknown> = { source, idempotencyKey };
    if (cafeId) where.cafeId = cafeId;

    const record = await this.prisma.processedMessage.findFirst({
      where: where as any,
      select: { id: true, entityType: true, entityId: true, status: true },
    });

    if (!record) return { duplicated: false };

    if (record.status === 'failed') return { duplicated: false };

    return {
      duplicated: true,
      entityType: record.entityType ?? undefined,
      entityId: record.entityId ?? undefined,
    };
  }

  async record(
    source: string,
    idempotencyKey: string,
    entityType: string,
    entityId: string | undefined,
    status: string,
    cafeId: string,
    tx: TransactionClient,
    requestHash?: string,
  ): Promise<void> {
    await tx.processedMessage.create({
      data: {
        cafeId,
        source,
        idempotencyKey,
        entityType,
        entityId: entityId ?? null,
        status,
        requestHash: requestHash ?? null,
        completedAt: status === 'completed' ? new Date() : null,
      } as any,
    });
  }

  async assertNotProcessed(
    source: string,
    idempotencyKey: string,
    cafeId?: string,
  ): Promise<void> {
    const result = await this.isProcessed(source, idempotencyKey, cafeId);
    if (result.duplicated) {
      throw new ConflictException({
        message: `Duplicate request: already processed as ${result.entityType} ${result.entityId}`,
        entityType: result.entityType,
        entityId: result.entityId,
      });
    }
  }

  static generateKey(...parts: string[]): string {
    return parts.filter(Boolean).join(':');
  }

  static hashPayload(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
