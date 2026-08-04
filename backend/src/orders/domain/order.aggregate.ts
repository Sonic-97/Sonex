import { randomUUID } from 'crypto';
import { OrderStatus } from '../dto/update-order-status.dto';
import { ORDER_TRANSITIONS } from './order-status';
import { OrderItemSnapshot, OrderSerializer, OrderSnapshot, CURRENT_ORDER_SNAPSHOT_SCHEMA_VERSION } from './order.snapshot';
import { InvalidOrderTransitionError, OrderRoleNotAllowedError } from './order.errors';

export interface OrderItemInput {
  productId: string;
  quantity: number;
  unitPrice: string;
  notes: string | null;
}

export interface CreateOrderInput {
  id?: string;
  cafeId: string;
  branchId: string;
  customerId: string;
  code: string;
  type: string;
  source?: string;
  sourceType?: string;
  address?: string | null;
  staffId?: string | null;
  employeeId?: string | null;
  createdById?: string | null;
  externalId?: string | null;
  total: string;
  items: OrderItemInput[];
}

interface OrderState {
  id: string;
  cafeId: string;
  branchId: string;
  customerId: string;
  code: string;
  status: OrderStatus;
  type: string;
  source: string;
  sourceType: string;
  address: string | null;
  staffId: string | null;
  employeeId: string | null;
  createdById: string | null;
  externalId: string | null;
  total: string;
  stockDeducted: boolean;
  paymentStatus: string | null;
  items: OrderItemSnapshot[];
  aggregateVersion: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  preparedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  paidAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
}

export class Order {
  private constructor(private readonly state: OrderState) {}

  static create(input: CreateOrderInput): Order {
    const now = new Date().toISOString();
    return new Order({
      id: input.id ?? randomUUID(),
      cafeId: input.cafeId,
      branchId: input.branchId,
      customerId: input.customerId,
      code: input.code,
      status: OrderStatus.NEW,
      type: input.type,
      source: input.source ?? 'IN_CAFE',
      sourceType: input.sourceType ?? 'INSIDE_CAFE',
      address: input.address ?? null,
      staffId: input.staffId ?? null,
      employeeId: input.employeeId ?? null,
      createdById: input.createdById ?? null,
      externalId: input.externalId ?? null,
      total: input.total,
      stockDeducted: false,
      paymentStatus: 'UNPAID',
      items: input.items,
      aggregateVersion: 1,
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      preparedAt: null,
      readyAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      paidAt: null,
      closedAt: null,
      cancelledAt: null,
    });
  }

  static rehydrate(snapshot: OrderSnapshot): Order {
    const state: OrderState = {
      id: snapshot.id,
      cafeId: snapshot.cafeId,
      branchId: snapshot.branchId,
      customerId: snapshot.customerId,
      code: snapshot.code,
      status: snapshot.status,
      type: snapshot.type,
      source: snapshot.source,
      sourceType: snapshot.sourceType,
      address: snapshot.address,
      staffId: snapshot.staffId,
      employeeId: snapshot.employeeId,
      createdById: snapshot.createdById,
      externalId: snapshot.externalId,
      total: snapshot.total,
      stockDeducted: snapshot.stockDeducted,
      paymentStatus: snapshot.paymentStatus,
      items: snapshot.items,
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      confirmedAt: snapshot.confirmedAt,
      preparedAt: snapshot.preparedAt,
      readyAt: snapshot.readyAt,
      pickedUpAt: snapshot.pickedUpAt,
      deliveredAt: snapshot.deliveredAt,
      paidAt: snapshot.paidAt,
      closedAt: snapshot.closedAt,
      cancelledAt: snapshot.cancelledAt,
    };
    return new Order(state);
  }

  transitionTo(target: OrderStatus, userRole?: string): void {
    const rule = ORDER_TRANSITIONS[this.state.status];
    if (!rule || rule.next !== target) {
      throw new InvalidOrderTransitionError(this.state.id, this.state.status, target);
    }
    if (userRole && !rule.allowedRoles.includes(userRole)) {
      throw new OrderRoleNotAllowedError(this.state.id, this.state.status, target, userRole);
    }
    const now = new Date().toISOString();
    this.state.status = target;
    if (rule.timestampField) {
      (this.state as unknown as Record<string, unknown>)[rule.timestampField] = now;
    }
    if (target === OrderStatus.PAID) {
      this.state.paymentStatus = 'PAID';
    }
    this.state.aggregateVersion++;
    this.state.updatedAt = now;
  }

  cancel(): void {
    if (this.state.status === OrderStatus.CANCELLED) return;
    const now = new Date().toISOString();
    this.state.status = OrderStatus.CANCELLED;
    this.state.cancelledAt = now;
    this.state.aggregateVersion++;
    this.state.updatedAt = now;
  }

  toSnapshot(): OrderSnapshot {
    return OrderSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_ORDER_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion: this.state.aggregateVersion,
      id: this.state.id,
      cafeId: this.state.cafeId,
      branchId: this.state.branchId,
      customerId: this.state.customerId,
      code: this.state.code,
      status: this.state.status,
      type: this.state.type,
      source: this.state.source,
      sourceType: this.state.sourceType,
      address: this.state.address,
      staffId: this.state.staffId,
      employeeId: this.state.employeeId,
      createdById: this.state.createdById,
      externalId: this.state.externalId,
      total: this.state.total,
      stockDeducted: this.state.stockDeducted,
      paymentStatus: this.state.paymentStatus,
      items: this.state.items,
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt,
      confirmedAt: this.state.confirmedAt,
      preparedAt: this.state.preparedAt,
      readyAt: this.state.readyAt,
      pickedUpAt: this.state.pickedUpAt,
      deliveredAt: this.state.deliveredAt,
      paidAt: this.state.paidAt,
      closedAt: this.state.closedAt,
      cancelledAt: this.state.cancelledAt,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get status(): OrderStatus {
    return this.state.status;
  }

  get cafeId(): string {
    return this.state.cafeId;
  }

  get branchId(): string {
    return this.state.branchId;
  }

  get aggregateVersion(): number {
    return this.state.aggregateVersion;
  }

  get total(): string {
    return this.state.total;
  }
}
