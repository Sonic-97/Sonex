import { StockReservationRepository } from '../domain/stock-reservation.repository';

export interface ExpiredReservationResult {
  reservationId: string;
  inventoryId: string;
  orderId: string;
  cafeId: string;
  quantity: number;
  ageMinutes: number;
}

export class StockReservationApplicationService {
  constructor(private readonly repository: StockReservationRepository) {}

  async expireStaleReservations(expiryMinutes: number): Promise<ExpiredReservationResult[]> {
    const cutoff = new Date(Date.now() - expiryMinutes * 60 * 1000);
    const stale = await this.repository.findActiveCreatedBefore(cutoff);
    const results: ExpiredReservationResult[] = [];

    for (const reservation of stale) {
      try {
        reservation.expire();
        await this.repository.save(reservation);
        results.push({
          reservationId: reservation.id,
          inventoryId: reservation.inventoryId,
          orderId: reservation.orderId,
          cafeId: reservation.cafeId,
          quantity: reservation.quantity,
          ageMinutes: Math.max(0, Math.floor((Date.now() - reservation.createdAt.getTime()) / 60000)),
        });
      } catch (err) {
        // Skip failed expirations; they will be retried on the next cycle.
      }
    }

    return results;
  }

  async getActiveReservationOrderIds(): Promise<string[]> {
    const active = await this.repository.findAllActive();
    return [...new Set(active.map(r => r.orderId))];
  }

  async releaseActiveForOrders(orderIds: string[]): Promise<number> {
    const orderSet = new Set(orderIds);
    const active = await this.repository.findAllActive();
    let count = 0;

    for (const reservation of active) {
      if (!orderSet.has(reservation.orderId)) continue;
      try {
        reservation.release();
        await this.repository.save(reservation, 'crash_recovery_release');
        count++;
      } catch (err) {
        // Skip failed releases; they will be retried on the next cycle.
      }
    }

    return count;
  }

  async confirmActiveForOrders(orderIds: string[]): Promise<number> {
    const orderSet = new Set(orderIds);
    const active = await this.repository.findAllActive();
    let count = 0;

    for (const reservation of active) {
      if (!orderSet.has(reservation.orderId)) continue;
      try {
        reservation.confirm();
        await this.repository.save(reservation, 'crash_recovery_confirm');
        count++;
      } catch (err) {
        // Skip failed confirmations; they will be retried on the next cycle.
      }
    }

    return count;
  }
}
