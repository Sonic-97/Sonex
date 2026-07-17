import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CrashRecoveryService {
  private readonly logger = new Logger(CrashRecoveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recoverOnStartup(): Promise<{ released: number; confirmed: number; expired: number }> {
    this.logger.log('Starting crash recovery for stock reservations...');

    const released = await this.releaseActiveCancelled();
    const confirmed = await this.confirmActiveNonNew();
    const expired = await this.expireStaleReservations();

    this.logger.log(`Crash recovery complete: released=${released}, confirmed=${confirmed}, expired=${expired}`);
    return { released, confirmed, expired };
  }

  private async releaseActiveCancelled(): Promise<number> {
    const activeReservations = await this.prisma.stockReservation.findMany({
      where: { status: 'ACTIVE' },
    });

    const orderIds = [...new Set(activeReservations.map((r) => r.orderId))];
    if (orderIds.length === 0) return 0;

    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, status: true },
    });

    const cancelledOrderIds = new Set(
      orders.filter((o) => o.status === 'CANCELLED').map((o) => o.id),
    );

    let count = 0;
    for (const res of activeReservations) {
      if (!cancelledOrderIds.has(res.orderId)) continue;

      await this.prisma.$transaction(async (tx) => {
        const inv = await tx.inventory.findUnique({
          where: { id: res.inventoryId },
          select: { currentQty: true, reservedQty: true, cafeId: true },
        });
        if (!inv) return;

        await tx.inventory.update({
          where: { id: res.inventoryId },
          data: {
            reservedQty: { decrement: res.quantity },
            version: { increment: 1 },
          },
        });

        await tx.stockReservation.update({
          where: { id: res.id },
          data: { status: 'RELEASED', releasedAt: new Date() },
        });

        await tx.stockLedger.create({
          data: {
            cafeId: inv.cafeId,
            inventoryId: res.inventoryId,
            orderId: res.orderId,
            change: new Prisma.Decimal(0),
            balanceBefore: inv.currentQty,
            balanceAfter: inv.currentQty,
            reservedBefore: inv.reservedQty,
            reservedAfter: inv.reservedQty.sub(res.quantity),
            reason: 'crash_recovery_release',
          },
        });
      });

      count++;
    }

    if (count > 0) this.logger.log(`Released ${count} active reservations for cancelled orders`);
    return count;
  }

  private async confirmActiveNonNew(): Promise<number> {
    const activeReservations = await this.prisma.stockReservation.findMany({
      where: { status: 'ACTIVE' },
      include: { inventory: { select: { itemName: true } } },
    });

    const orderIds = [...new Set(activeReservations.map((r) => r.orderId))];
    if (orderIds.length === 0) return 0;

    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, status: true, cafeId: true },
    });

    const orderStatusMap = new Map(orders.map((o) => [o.id, o]));

    let count = 0;
    for (const res of activeReservations) {
      const ord = orderStatusMap.get(res.orderId);
      if (!ord || ord.status === 'NEW' || ord.status === 'CANCELLED') continue;

      await this.prisma.$transaction(async (tx) => {
        const inv = await tx.inventory.findUnique({
          where: { id: res.inventoryId },
          select: { currentQty: true, reservedQty: true, cafeId: true, itemName: true },
        });
        if (!inv) return;

        const newCurrent = inv.currentQty.sub(res.quantity);
        if (newCurrent.lt(0)) {
          this.logger.warn(`Cannot confirm reservation ${res.id} — negative stock for ${inv.itemName}`);
          await tx.stockReservation.update({
            where: { id: res.id },
            data: { status: 'RELEASED', releasedAt: new Date() },
          });
          return;
        }

        await tx.inventory.update({
          where: { id: res.inventoryId },
          data: {
            currentQty: { decrement: res.quantity },
            reservedQty: { decrement: res.quantity },
            version: { increment: 1 },
          },
        });

        await tx.stockReservation.update({
          where: { id: res.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });

        await tx.stockLedger.create({
          data: {
            cafeId: inv.cafeId,
            inventoryId: res.inventoryId,
            orderId: res.orderId,
            change: res.quantity.negated(),
            balanceBefore: inv.currentQty,
            balanceAfter: newCurrent,
            reservedBefore: inv.reservedQty,
            reservedAfter: inv.reservedQty.sub(res.quantity),
            reason: 'crash_recovery_confirm',
          },
        });
      });

      count++;
    }

    if (count > 0) this.logger.log(`Confirmed ${count} active reservations for non-NEW orders`);
    return count;
  }

  private async expireStaleReservations(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stale = await this.prisma.stockReservation.findMany({
      where: {
        status: 'ACTIVE',
        createdAt: { lt: cutoff },
      },
    });

    let count = 0;
    for (const res of stale) {
      await this.prisma.$transaction(async (tx) => {
        const inv = await tx.inventory.findUnique({
          where: { id: res.inventoryId },
          select: { currentQty: true, reservedQty: true, cafeId: true },
        });
        if (!inv) return;

        await tx.inventory.update({
          where: { id: res.inventoryId },
          data: {
            reservedQty: { decrement: res.quantity },
            version: { increment: 1 },
          },
        });

        await tx.stockReservation.update({
          where: { id: res.id },
          data: { status: 'EXPIRED', releasedAt: new Date() },
        });

        await tx.stockLedger.create({
          data: {
            cafeId: inv.cafeId,
            inventoryId: res.inventoryId,
            orderId: res.orderId,
            change: new Prisma.Decimal(0),
            balanceBefore: inv.currentQty,
            balanceAfter: inv.currentQty,
            reservedBefore: inv.reservedQty,
            reservedAfter: inv.reservedQty.sub(res.quantity),
            reason: 'crash_recovery_expire',
          },
        });
      });

      count++;
    }

    if (count > 0) this.logger.log(`Expired ${count} stale active reservations (>24h)`);
    return count;
  }
}
