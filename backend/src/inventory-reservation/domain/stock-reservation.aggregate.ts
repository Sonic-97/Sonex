import { randomUUID } from 'crypto';
import {
  StockReservationSnapshot,
  StockReservationSerializer,
  CURRENT_SNAPSHOT_SCHEMA_VERSION,
  StockReservationStatus,
} from './stock-reservation.snapshot';
import { InvalidStockReservationTransitionError } from './stock-reservation.errors';

interface StockReservationState {
  id: string;
  cafeId: string;
  inventoryId: string;
  orderId: string;
  quantity: number;
  status: StockReservationStatus;
  aggregateVersion: number;
  createdAt: Date;
  confirmedAt: Date | null;
  releasedAt: Date | null;
}

export class StockReservation {
  private constructor(private readonly state: StockReservationState) {}

  static create(cafeId: string, inventoryId: string, orderId: string, quantity: number): StockReservation {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Reservation quantity must be a positive number');
    }
    return new StockReservation({
      id: randomUUID(),
      cafeId,
      inventoryId,
      orderId,
      quantity,
      status: 'ACTIVE',
      aggregateVersion: 1,
      createdAt: new Date(),
      confirmedAt: null,
      releasedAt: null,
    });
  }

  static rehydrate(snapshot: StockReservationSnapshot): StockReservation {
    return new StockReservation({
      id: snapshot.id,
      cafeId: snapshot.cafeId,
      inventoryId: snapshot.inventoryId,
      orderId: snapshot.orderId,
      quantity: Number(snapshot.quantity),
      status: snapshot.status,
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: new Date(snapshot.createdAt),
      confirmedAt: snapshot.confirmedAt ? new Date(snapshot.confirmedAt) : null,
      releasedAt: snapshot.releasedAt ? new Date(snapshot.releasedAt) : null,
    });
  }

  confirm(): void {
    this.assertActive('confirm');
    this.state.status = 'CONFIRMED';
    this.state.confirmedAt = new Date();
    this.state.aggregateVersion++;
  }

  release(): void {
    this.assertActive('release');
    this.state.status = 'RELEASED';
    this.state.releasedAt = new Date();
    this.state.aggregateVersion++;
  }

  expire(): void {
    this.assertActive('expire');
    this.state.status = 'EXPIRED';
    this.state.releasedAt = new Date();
    this.state.aggregateVersion++;
  }

  toSnapshot(): StockReservationSnapshot {
    return StockReservationSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion: this.state.aggregateVersion,
      id: this.state.id,
      cafeId: this.state.cafeId,
      inventoryId: this.state.inventoryId,
      orderId: this.state.orderId,
      quantity: String(this.state.quantity),
      status: this.state.status,
      createdAt: this.state.createdAt.toISOString(),
      confirmedAt: this.state.confirmedAt?.toISOString() ?? null,
      releasedAt: this.state.releasedAt?.toISOString() ?? null,
    });
  }

  get id(): string { return this.state.id; }
  get cafeId(): string { return this.state.cafeId; }
  get inventoryId(): string { return this.state.inventoryId; }
  get orderId(): string { return this.state.orderId; }
  get quantity(): number { return this.state.quantity; }
  get status(): StockReservationStatus { return this.state.status; }
  get aggregateVersion(): number { return this.state.aggregateVersion; }
  get createdAt(): Date { return this.state.createdAt; }
  get confirmedAt(): Date | null { return this.state.confirmedAt; }
  get releasedAt(): Date | null { return this.state.releasedAt; }

  private assertActive(action: string): void {
    if (this.state.status !== 'ACTIVE') {
      throw new InvalidStockReservationTransitionError(this.state.id, this.state.status, action);
    }
  }
}
