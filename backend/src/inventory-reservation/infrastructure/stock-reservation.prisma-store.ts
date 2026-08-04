import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PersistenceRecord, StockReservationStore } from '../domain/stock-reservation.repository';
import {
  StockReservationSerializer,
  CURRENT_SNAPSHOT_SCHEMA_VERSION,
  StockReservationStatus,
} from '../domain/stock-reservation.snapshot';

@Injectable()
export class StockReservationPrismaStore implements StockReservationStore {
  constructor(private readonly prisma: PrismaService) {}

  async loadRecord(id: string): Promise<PersistenceRecord | null> {
    const row = await this.prisma.stockReservation.findUnique({ where: { id } });
    if (!row) return null;
    return this.toRecord(row);
  }

  async saveRecord(record: PersistenceRecord, ledgerReason?: string): Promise<void> {
    const snapshot = StockReservationSerializer.deserialize(record.snapshotJson);

    switch (snapshot.status) {
      case 'EXPIRED':
        await this.releaseReservedOnly(snapshot, 'EXPIRED', ledgerReason ?? 'reservation_expired');
        return;
      case 'RELEASED':
        await this.releaseReservedOnly(snapshot, 'RELEASED', ledgerReason ?? 'released');
        return;
      case 'CONFIRMED':
        await this.confirmReservation(snapshot, ledgerReason ?? 'confirmed');
        return;
      default:
        await this.prisma.stockReservation.update({
          where: { id: snapshot.id },
          data: { status: snapshot.status },
        });
    }
  }

  async findAllActive(): Promise<PersistenceRecord[]> {
    const rows = await this.prisma.stockReservation.findMany({
      where: { status: 'ACTIVE' },
    });
    return rows.map(r => this.toRecord(r));
  }

  async findActiveCreatedBefore(cutoff: Date): Promise<PersistenceRecord[]> {
    const rows = await this.prisma.stockReservation.findMany({
      where: { status: 'ACTIVE', createdAt: { lt: cutoff } },
    });
    return rows.map(r => this.toRecord(r));
  }

  private async releaseReservedOnly(
    snapshot: { id: string; cafeId: string; inventoryId: string; orderId: string; quantity: string },
    terminalStatus: 'EXPIRED' | 'RELEASED',
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: { id: snapshot.inventoryId },
        select: { currentQty: true, reservedQty: true, version: true },
      });
      if (!inv) return;

      const quantity = new Prisma.Decimal(snapshot.quantity);
      const newReserved = inv.reservedQty.sub(quantity);
      if (newReserved.lt(0)) {
        throw new Error(`Cannot ${terminalStatus.toLowerCase()} reservation ${snapshot.id}: reservedQty would become negative`);
      }

      const updated = await tx.inventory.updateMany({
        where: { id: snapshot.inventoryId, version: inv.version },
        data: {
          reservedQty: newReserved,
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new Error(`Version conflict while releasing reservation ${snapshot.id}`);
      }

      await tx.stockReservation.update({
        where: { id: snapshot.id },
        data: {
          status: terminalStatus,
          confirmedAt: null,
          releasedAt: new Date(),
        },
      });

      await tx.stockLedger.create({
        data: {
          cafeId: snapshot.cafeId,
          inventoryId: snapshot.inventoryId,
          orderId: snapshot.orderId,
          change: new Prisma.Decimal(0),
          balanceBefore: inv.currentQty,
          balanceAfter: inv.currentQty,
          reservedBefore: inv.reservedQty,
          reservedAfter: newReserved,
          reason,
        },
      });
    });
  }

  private async confirmReservation(
    snapshot: { id: string; cafeId: string; inventoryId: string; orderId: string; quantity: string },
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: { id: snapshot.inventoryId },
        select: { currentQty: true, reservedQty: true, version: true },
      });
      if (!inv) return;

      const quantity = new Prisma.Decimal(snapshot.quantity);
      const newCurrent = inv.currentQty.sub(quantity);

      if (newCurrent.lt(0)) {
        await tx.stockReservation.update({
          where: { id: snapshot.id },
          data: { status: 'RELEASED', confirmedAt: null, releasedAt: new Date() },
        });
        return;
      }

      const newReserved = inv.reservedQty.sub(quantity);
      if (newReserved.lt(0)) {
        throw new Error(`Cannot confirm reservation ${snapshot.id}: reservedQty would become negative`);
      }

      const updated = await tx.inventory.updateMany({
        where: { id: snapshot.inventoryId, version: inv.version },
        data: {
          currentQty: newCurrent,
          reservedQty: newReserved,
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new Error(`Version conflict while confirming reservation ${snapshot.id}`);
      }

      await tx.stockReservation.update({
        where: { id: snapshot.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date(), releasedAt: null },
      });

      await tx.stockLedger.create({
        data: {
          cafeId: snapshot.cafeId,
          inventoryId: snapshot.inventoryId,
          orderId: snapshot.orderId,
          change: quantity.negated(),
          balanceBefore: inv.currentQty,
          balanceAfter: newCurrent,
          reservedBefore: inv.reservedQty,
          reservedAfter: newReserved,
          reason,
        },
      });
    });
  }

  private toRecord(row: {
    id: string;
    cafeId: string;
    inventoryId: string;
    orderId: string;
    quantity: unknown;
    status: string;
    createdAt?: Date | null;
    confirmedAt?: Date | null;
    releasedAt?: Date | null;
  }): PersistenceRecord {
    const snapshot = StockReservationSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion: 1,
      id: row.id,
      cafeId: row.cafeId,
      inventoryId: row.inventoryId,
      orderId: row.orderId,
      quantity: String(row.quantity),
      status: (row.status as StockReservationStatus) ?? 'ACTIVE',
      createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
      releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
    });
    return {
      id: row.id,
      snapshotJson: StockReservationSerializer.storeJson(snapshot),
      aggregateVersion: 1,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      updatedAt: row.releasedAt ? new Date(row.releasedAt) : new Date(),
    };
  }
}
