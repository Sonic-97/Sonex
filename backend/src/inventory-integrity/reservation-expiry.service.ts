import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service';
import { DomainEventTypes } from '../domain-events/domain-event.registry';

const DEFAULT_EXPIRY_MINUTES = 30;

@Injectable()
export class ReservationExpiryService {
  private readonly logger = new Logger(ReservationExpiryService.name);
  private readonly expiryMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEventBus: DomainEventBusService,
  ) {
    this.expiryMinutes = parseInt(process.env.RESERVATION_EXPIRY_MINUTES || String(DEFAULT_EXPIRY_MINUTES), 10);
  }

  async expireStaleReservations(): Promise<number> {
    const cutoff = new Date(Date.now() - this.expiryMinutes * 60 * 1000);
    let expiredCount = 0;

    const staleReservations = await this.prisma.stockReservation.findMany({
      where: {
        status: 'ACTIVE',
        createdAt: { lt: cutoff },
      },
      include: {
        inventory: {
          select: { id: true, currentQty: true, reservedQty: true, version: true, cafeId: true, itemName: true },
        },
      },
    });

    for (const res of staleReservations) {
      try {
        await this.releaseExpiredReservation(res);
        expiredCount++;
      } catch (err) {
        this.logger.error(`Failed to expire reservation ${res.id}: ${(err as Error).message}`);
      }
    }

    if (expiredCount > 0) {
      this.logger.log(`Expired ${expiredCount} stale reservations older than ${this.expiryMinutes} minutes`);
    }

    return expiredCount;
  }

  private async releaseExpiredReservation(res: {
    id: string;
    inventoryId: string;
    orderId: string;
    cafeId: string;
    quantity: any;
    createdAt: Date;
    inventory: { id: string; currentQty: any; reservedQty: any; version: number; cafeId: string; itemName: string };
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: { id: res.inventoryId },
        select: { currentQty: true, reservedQty: true, version: true },
      });
      if (!inv) return;

      const newReserved = inv.reservedQty.sub(res.quantity);
      if (newReserved.lt(0)) {
        this.logger.warn(`Cannot expire reservation ${res.id}: reservedQty would become negative`);
        return;
      }

      const updated = await tx.inventory.updateMany({
        where: { id: res.inventoryId, version: inv.version },
        data: {
          reservedQty: newReserved,
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        this.logger.warn(`Version conflict expiring reservation ${res.id}, will retry next cycle`);
        return;
      }

      await tx.stockReservation.update({
        where: { id: res.id },
        data: { status: 'EXPIRED', releasedAt: new Date() },
      });

      await tx.stockLedger.create({
        data: {
          cafeId: res.cafeId,
          inventoryId: res.inventoryId,
          orderId: res.orderId,
          change: new Prisma.Decimal(0),
          balanceBefore: inv.currentQty,
          balanceAfter: inv.currentQty,
          reservedBefore: inv.reservedQty,
          reservedAfter: newReserved,
          reason: 'reservation_expired',
        },
      });

      const ageMs = Date.now() - new Date(res.createdAt).getTime();
      const ageMinutes = Math.floor(ageMs / 60000);

      this.domainEventBus.publish(DomainEventTypes.RESERVATION_EXPIRED, {
        reservationId: res.id,
        inventoryId: res.inventoryId,
        orderId: res.orderId,
        cafeId: res.cafeId,
        quantity: Number(res.quantity),
        ageMinutes,
      }).catch(() => {});
    });
  }
}
