import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InCafeOrderStore, PersistenceRecord } from '../domain/in-cafe-order.repository';
import {
  InCafeOrderSerializer,
  InCafeOrderSnapshot,
  CURRENT_IN_CAFE_ORDER_SNAPSHOT_SCHEMA_VERSION,
} from '../domain/in-cafe-order.snapshot';
import { PaymentStatus } from '../dto/update-payment.dto';

@Injectable()
export class InCafeOrderPrismaStore implements InCafeOrderStore {
  constructor(private readonly prisma: PrismaService) {}

  async loadRecord(id: string): Promise<PersistenceRecord | null> {
    const row = await this.prisma.inCafeOrder.findUnique({ where: { id } });
    if (!row) return null;
    return this.toRecord(row);
  }

  async saveRecord(record: PersistenceRecord, tx?: unknown): Promise<void> {
    const db = (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
    const snapshot = InCafeOrderSerializer.deserialize(record.snapshotJson);

    const existing = await db.inCafeOrder.findUnique({
      where: { id: snapshot.id },
      select: { id: true },
    });

    if (!existing) {
      await db.inCafeOrder.create({ data: this.toCreateData(snapshot) });
      return;
    }

    await db.inCafeOrder.update({
      where: { id: snapshot.id },
      data: this.toUpdateData(snapshot),
    });
  }

  private toCreateData(snapshot: InCafeOrderSnapshot): Prisma.InCafeOrderUncheckedCreateInput {
    return {
      id: snapshot.id,
      code: snapshot.code,
      cafeId: snapshot.cafeId,
      branchId: snapshot.branchId,
      customerName: snapshot.customerName,
      customerPhone: snapshot.customerPhone,
      customerId: snapshot.customerId,
      createdById: snapshot.createdById,
      notes: snapshot.notes,
      status: snapshot.status,
      isPaid: snapshot.isPaid,
      paymentStatus: snapshot.paymentStatus,
      paymentMethod: snapshot.paymentMethod,
      total: new Prisma.Decimal(snapshot.total),
      paidAmount: new Prisma.Decimal(snapshot.paidAmount),
      remainingBalance: new Prisma.Decimal(snapshot.remainingBalance),
      paymentTimestamp: snapshot.paymentTimestamp ? new Date(snapshot.paymentTimestamp) : null,
      voidReason: snapshot.voidReason,
      orderType: snapshot.orderType,
      tableNumber: snapshot.tableNumber,
      employeeId: snapshot.employeeId,
      sourceType: snapshot.sourceType,
      stockDeducted: snapshot.stockDeducted,
      isRevenueConfirmed: snapshot.isRevenueConfirmed,
      items: {
        create: snapshot.items.map((item) => ({
          cafeId: snapshot.cafeId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          notes: item.notes,
          selectedOptions: item.selectedOptions as unknown as Prisma.InputJsonValue,
        })),
      },
    };
  }

  private toUpdateData(snapshot: InCafeOrderSnapshot): Prisma.InCafeOrderUncheckedUpdateInput {
    return {
      customerName: snapshot.customerName,
      customerPhone: snapshot.customerPhone,
      customerId: snapshot.customerId,
      notes: snapshot.notes,
      status: snapshot.status,
      isPaid: snapshot.isPaid,
      paymentStatus: snapshot.paymentStatus,
      paymentMethod: snapshot.paymentMethod,
      total: new Prisma.Decimal(snapshot.total),
      paidAmount: new Prisma.Decimal(snapshot.paidAmount),
      remainingBalance: new Prisma.Decimal(snapshot.remainingBalance),
      paymentTimestamp: snapshot.paymentTimestamp ? new Date(snapshot.paymentTimestamp) : null,
      voidReason: snapshot.voidReason,
      stockDeducted: snapshot.stockDeducted,
    };
  }

  private toRecord(row: {
    id: string;
    cafeId: string;
    branchId: string;
    code: string;
    customerName: string;
    customerPhone: string | null;
    customerId: string | null;
    notes: string | null;
    createdById: string | null;
    status: string;
    isPaid: boolean;
    paymentStatus: string;
    paymentMethod: string | null;
    total: unknown;
    paidAmount: unknown;
    remainingBalance: unknown;
    paymentTimestamp: Date | null;
    voidReason: string | null;
    orderType: string;
    tableNumber: string | null;
    employeeId: string | null;
    sourceType: string;
    stockDeducted: boolean;
    isRevenueConfirmed: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): PersistenceRecord {
    const snapshot = InCafeOrderSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_IN_CAFE_ORDER_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion: 1,
      id: row.id,
      cafeId: row.cafeId,
      branchId: row.branchId,
      code: row.code,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      customerId: row.customerId,
      notes: row.notes,
      createdById: row.createdById,
      status: row.status,
      isPaid: row.isPaid,
      paymentStatus: row.paymentStatus as PaymentStatus,
      paymentMethod: row.paymentMethod,
      total: String(row.total),
      paidAmount: String(row.paidAmount),
      remainingBalance: String(row.remainingBalance),
      paymentTimestamp: row.paymentTimestamp ? row.paymentTimestamp.toISOString() : null,
      voidReason: row.voidReason,
      orderType: row.orderType,
      tableNumber: row.tableNumber,
      employeeId: row.employeeId,
      sourceType: row.sourceType,
      stockDeducted: row.stockDeducted,
      isRevenueConfirmed: row.isRevenueConfirmed,
      items: [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
    return {
      id: row.id,
      snapshotJson: InCafeOrderSerializer.storeJson(snapshot),
      aggregateVersion: 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
