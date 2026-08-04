import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStore, PersistenceRecord } from '../domain/order.repository';
import {
  OrderSerializer,
  OrderSnapshot,
  CURRENT_ORDER_SNAPSHOT_SCHEMA_VERSION,
} from '../domain/order.snapshot';
import { ORDER_TIMESTAMP_FIELDS } from '../domain/order-status';
import { OptimisticConcurrencyError } from '../domain/order.errors';
import { OrderStatus } from '../dto/update-order-status.dto';

@Injectable()
export class OrderPrismaStore implements OrderStore {
  constructor(private readonly prisma: PrismaService) {}

  async loadRecord(id: string): Promise<PersistenceRecord | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    if (!row) return null;
    return this.toRecord(row);
  }

  async saveRecord(record: PersistenceRecord, tx?: unknown): Promise<void> {
    const db = (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
    const snapshot = OrderSerializer.deserialize(record.snapshotJson);

    const existing = await db.order.findUnique({
      where: { id: snapshot.id },
      select: { id: true, version: true },
    });

    if (!existing) {
      await db.order.create({ data: this.toCreateData(snapshot) });
      return;
    }

    const result = await db.order.updateMany({
      where: { id: snapshot.id, version: existing.version },
      data: this.toUpdateData(snapshot),
    });

    if (result.count === 0) {
      throw new OptimisticConcurrencyError(snapshot.id);
    }
  }

  private toCreateData(snapshot: OrderSnapshot): Prisma.OrderCreateInput {
    return {
      id: snapshot.id,
      code: snapshot.code,
      cafe: { connect: { id: snapshot.cafeId } },
      branch: { connect: { id: snapshot.branchId } },
      customer: { connect: { id: snapshot.customerId } },
      staff: snapshot.staffId ? { connect: { id: snapshot.staffId } } : undefined,
      employee: snapshot.employeeId ? { connect: { id: snapshot.employeeId } } : undefined,
      createdBy: snapshot.createdById ? { connect: { id: snapshot.createdById } } : undefined,
      externalId: snapshot.externalId,
      version: snapshot.aggregateVersion,
      status: snapshot.status,
      type: snapshot.type,
      source: snapshot.source,
      sourceType: snapshot.sourceType,
      address: snapshot.address,
      total: new Prisma.Decimal(snapshot.total),
      stockDeducted: snapshot.stockDeducted,
      paymentStatus: snapshot.paymentStatus ?? 'UNPAID',
      items: {
        create: snapshot.items.map((item) => ({
          product: { connect: { id: item.productId } },
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          notes: item.notes,
        })),
      },
    };
  }

  private toUpdateData(snapshot: OrderSnapshot): Prisma.OrderUpdateManyMutationInput {
    const data: Prisma.OrderUpdateManyMutationInput = {
      status: snapshot.status,
      version: { increment: 1 },
    };

    for (const field of ORDER_TIMESTAMP_FIELDS) {
      const value = (snapshot as unknown as Record<string, unknown>)[field];
      if (typeof value === 'string' && value) {
        (data as unknown as Record<string, unknown>)[field] = new Date(value);
      }
    }

    if (snapshot.paymentStatus) {
      (data as unknown as Record<string, unknown>).paymentStatus = snapshot.paymentStatus;
    }

    return data;
  }

  private toRecord(row: {
    id: string;
    code: string;
    cafeId: string;
    branchId: string;
    customerId: string;
    status: string;
    type: string;
    total: unknown;
    source: string;
    sourceType: string;
    address: string | null;
    staffId: string | null;
    employeeId: string | null;
    createdById: string | null;
    externalId: string | null;
    stockDeducted: boolean;
    paymentStatus: string;
    version: number;
    createdAt: Date;
    confirmedAt?: Date | null;
    preparedAt?: Date | null;
    readyAt?: Date | null;
    pickedUpAt?: Date | null;
    deliveredAt?: Date | null;
    paidAt?: Date | null;
    closedAt?: Date | null;
    cancelledAt?: Date | null;
  }): PersistenceRecord {
    const snapshot = OrderSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_ORDER_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion: row.version,
      id: row.id,
      cafeId: row.cafeId,
      branchId: row.branchId,
      customerId: row.customerId,
      code: row.code,
      status: row.status as OrderStatus,
      type: row.type,
      source: row.source,
      sourceType: row.sourceType,
      address: row.address,
      staffId: row.staffId,
      employeeId: row.employeeId,
      createdById: row.createdById,
      externalId: row.externalId,
      total: String(row.total),
      stockDeducted: row.stockDeducted,
      paymentStatus: row.paymentStatus,
      items: [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.createdAt.toISOString(),
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
      preparedAt: row.preparedAt ? row.preparedAt.toISOString() : null,
      readyAt: row.readyAt ? row.readyAt.toISOString() : null,
      pickedUpAt: row.pickedUpAt ? row.pickedUpAt.toISOString() : null,
      deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    });
    return {
      id: row.id,
      snapshotJson: OrderSerializer.storeJson(snapshot),
      aggregateVersion: row.version,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    };
  }
}
