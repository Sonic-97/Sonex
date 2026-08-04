import { PaymentIntentSnapshot, SnapshotSerializer, CURRENT_SNAPSHOT_SCHEMA_VERSION } from './payment-intent.snapshot';
import { Money } from './value-objects/money';
import { PaymentStatus, PaymentStatusValue } from './value-objects/payment-status';

export interface PaymentIntentState {
  id: string;
  tenantId: string;
  status: PaymentStatusValue;
  amount: Money;
  orderId: string;
  metadata: Record<string, unknown>;
  aggregateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export class PaymentIntent {
  private constructor(private readonly state: PaymentIntentState) {}

  static create(
    id: string,
    tenantId: string,
    amount: Money,
    orderId: string,
    metadata: Record<string, unknown> = {},
  ): PaymentIntent {
    return new PaymentIntent({
      id,
      tenantId,
      status: PaymentStatusValue.from(PaymentStatus.PENDING),
      amount,
      orderId,
      metadata,
      aggregateVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static rehydrate(snapshot: PaymentIntentSnapshot): PaymentIntent {
    const migrated = SnapshotSerializer.migrate(snapshot);

    return new PaymentIntent({
      id: migrated.id,
      tenantId: migrated.tenantId,
      status: PaymentStatusValue.fromSnapshot(migrated.status),
      amount: Money.fromSnapshot(migrated.amount),
      orderId: migrated.orderId,
      metadata: { ...migrated.metadata },
      aggregateVersion: migrated.aggregateVersion,
      createdAt: new Date(migrated.createdAt),
      updatedAt: new Date(migrated.updatedAt),
    });
  }

  authorize(): void {
    this.assertNotTerminal();
    if (!this.state.status.canTransitionTo(PaymentStatusValue.from(PaymentStatus.AUTHORIZED))) {
      throw new Error(`Cannot authorize PaymentIntent in status ${this.state.status.value}`);
    }
    this.state.status = PaymentStatusValue.from(PaymentStatus.AUTHORIZED);
    this.state.updatedAt = new Date();
    this.state.aggregateVersion++;
  }

  capture(): void {
    if (!this.state.status.canTransitionTo(PaymentStatusValue.from(PaymentStatus.CAPTURED))) {
      throw new Error(`Cannot capture PaymentIntent in status ${this.state.status.value}`);
    }
    this.state.status = PaymentStatusValue.from(PaymentStatus.CAPTURED);
    this.state.updatedAt = new Date();
    this.state.aggregateVersion++;
  }

  fail(): void {
    if (!this.state.status.canTransitionTo(PaymentStatusValue.from(PaymentStatus.FAILED))) {
      throw new Error(`Cannot fail PaymentIntent in status ${this.state.status.value}`);
    }
    this.state.status = PaymentStatusValue.from(PaymentStatus.FAILED);
    this.state.updatedAt = new Date();
    this.state.aggregateVersion++;
  }

  refund(): void {
    if (!this.state.status.canTransitionTo(PaymentStatusValue.from(PaymentStatus.REFUNDED))) {
      throw new Error(`Cannot refund PaymentIntent in status ${this.state.status.value}`);
    }
    this.state.status = PaymentStatusValue.from(PaymentStatus.REFUNDED);
    this.state.updatedAt = new Date();
    this.state.aggregateVersion++;
  }

  toSnapshot(): PaymentIntentSnapshot {
    const { id, tenantId, status, amount, orderId, metadata, aggregateVersion, createdAt, updatedAt } = this.state;
    return SnapshotSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion,
      id,
      tenantId,
      status: status.toSnapshot(),
      amount: amount.toSnapshot(),
      orderId,
      metadata: { ...metadata },
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  }

  get id(): string { return this.state.id; }
  get tenantId(): string { return this.state.tenantId; }
  get status(): PaymentStatusValue { return this.state.status; }
  get amount(): Money { return this.state.amount; }
  get orderId(): string { return this.state.orderId; }
  get aggregateVersion(): number { return this.state.aggregateVersion; }
  get createdAt(): Date { return this.state.createdAt; }
  get updatedAt(): Date { return this.state.updatedAt; }

  hasPendingEvents(): boolean {
    return false;
  }

  private assertNotTerminal(): void {
    if (this.state.status.isTerminal()) {
      throw new Error(`PaymentIntent ${this.state.id} is in terminal status ${this.state.status.value}`);
    }
  }
}
