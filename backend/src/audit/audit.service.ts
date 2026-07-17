import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditAction, ActorRole } from './dto/audit-log-entry.dto';

function toJson(v: unknown): Prisma.InputJsonValue {
  return (v ?? Prisma.DbNull) as Prisma.InputJsonValue;
}

export interface AuditLogInput {
  cafeId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  actorId?: string | null;
  actorRole?: ActorRole | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  /** @deprecated use entityType */
  entity?: string;
  /** @deprecated use actorId */
  userId?: string | null;
}

export interface AuditLogSearchResult {
  data: Array<{
    id: string;
    cafeId: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    actorId: string | null;
    actorRole: string | null;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  logAction(input: AuditLogInput): void {
    this.log(input).catch(() => {});
  }

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.buildData(input) });
    } catch (err) {
      this.logger.error(`Audit log failed: ${(err as Error).message}`);
    }
  }

  async logTransactional(tx: Prisma.TransactionClient, input: AuditLogInput): Promise<void> {
    await tx.auditLog.create({ data: this.buildData(input) });
  }

  async search(
    cafeId: string,
    query: {
      action?: string;
      entityType?: string;
      entityId?: string;
      actorId?: string;
      actorRole?: string;
      from?: string;
      to?: string;
      page: number;
      limit: number;
    },
  ): Promise<AuditLogSearchResult> {
    const where: Prisma.AuditLogWhereInput = { cafeId };

    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorId) where.actorId = query.actorId;
    if (query.actorRole) where.actorRole = query.actorRole;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id,
        cafeId: r.cafeId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actorId: r.actorId,
        actorRole: r.actorRole,
        beforeState: r.beforeState as Record<string, unknown> | null,
        afterState: r.afterState as Record<string, unknown> | null,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private buildData(input: AuditLogInput): Prisma.AuditLogCreateInput {
    return {
      cafe: { connect: { id: input.cafeId ?? '' } },
      action: input.action,
      entityType: input.entityType ?? input.entity ?? null,
      entityId: input.entityId ?? null,
      actorId: input.actorId ?? input.userId ?? null,
      actorRole: input.actorRole ?? null,
      beforeState: toJson(input.beforeState),
      afterState: toJson(input.afterState),
      metadata: toJson(input.metadata),
      idempotencyKey: input.idempotencyKey ?? null,
    };
  }
}
