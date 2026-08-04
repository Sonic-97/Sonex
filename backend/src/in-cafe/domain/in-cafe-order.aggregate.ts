import { randomUUID } from 'crypto';
import { PaymentStatus } from '../dto/update-payment.dto';
import { IN_CAFE_ORDER_TRANSITIONS, InCafeOrderStatus } from './in-cafe-order.status';
import {
  InCafeOrderItemSnapshot,
  InCafeOrderSerializer,
  InCafeOrderSnapshot,
  CURRENT_IN_CAFE_ORDER_SNAPSHOT_SCHEMA_VERSION,
} from './in-cafe-order.snapshot';
import {
  InCafeOrderAlreadyOnHoldError,
  InCafeOrderCannotCancelError,
  InCafeOrderCannotEditError,
  InCafeOrderCannotHoldError,
  InCafeOrderCannotPayError,
  InCafeOrderCannotVoidError,
  InCafeOrderNotOnHoldError,
  InvalidInCafeOrderTransitionError,
  InCafeOrderRoleNotAllowedError,
} from './in-cafe-order.errors';

export interface InCafeOrderItemInput {
  productId: string;
  quantity: number;
  unitPrice: string;
  notes: string | null;
  selectedOptions: unknown[];
}

export interface CreateInCafeOrderInput {
  id?: string;
  cafeId: string;
  branchId: string;
  code: string;
  customerName: string;
  customerPhone: string | null;
  customerId: string | null;
  notes: string | null;
  createdById: string | null;
  orderType: string;
  tableNumber: string | null;
  employeeId: string | null;
  sourceType: string;
  total: string;
  paymentStatus: PaymentStatus | string;
  paymentMethod: string | null;
  isPaid: boolean;
  paidAmount: string;
  remainingBalance: string;
  items: InCafeOrderItemInput[];
}

export interface PaymentUpdateInput {
  paymentStatus: PaymentStatus | string;
  paymentMethod: string | null;
  paidAmount: number;
}

interface InCafeOrderState {
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
  total: string;
  paidAmount: string;
  remainingBalance: string;
  paymentTimestamp: string | null;
  voidReason: string | null;
  orderType: string;
  tableNumber: string | null;
  employeeId: string | null;
  sourceType: string;
  stockDeducted: boolean;
  isRevenueConfirmed: boolean;
  items: InCafeOrderItemSnapshot[];
  aggregateVersion: number;
  createdAt: string;
  updatedAt: string;
}

export class InCafeOrder {
  private constructor(private readonly state: InCafeOrderState) {}

  static create(input: CreateInCafeOrderInput): InCafeOrder {
    const now = new Date().toISOString();
    return new InCafeOrder({
      id: input.id ?? randomUUID(),
      cafeId: input.cafeId,
      branchId: input.branchId,
      code: input.code,
      customerName: input.customerName,
      customerPhone: input.customerPhone ?? null,
      customerId: input.customerId ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
      status: InCafeOrderStatus.NEW,
      isPaid: input.isPaid,
      paymentStatus: input.paymentStatus ?? PaymentStatus.NOT_PAID,
      paymentMethod: input.paymentMethod ?? null,
      total: input.total,
      paidAmount: input.paidAmount ?? '0',
      remainingBalance: input.remainingBalance ?? input.total,
      paymentTimestamp: null,
      voidReason: null,
      orderType: input.orderType ?? 'DINE_IN',
      tableNumber: input.tableNumber ?? null,
      employeeId: input.employeeId ?? null,
      sourceType: input.sourceType ?? 'INSIDE_CAFE',
      stockDeducted: false,
      isRevenueConfirmed: false,
      items: input.items,
      aggregateVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(snapshot: InCafeOrderSnapshot): InCafeOrder {
    const state: InCafeOrderState = {
      id: snapshot.id,
      cafeId: snapshot.cafeId,
      branchId: snapshot.branchId,
      code: snapshot.code,
      customerName: snapshot.customerName,
      customerPhone: snapshot.customerPhone,
      customerId: snapshot.customerId,
      notes: snapshot.notes,
      createdById: snapshot.createdById,
      status: snapshot.status,
      isPaid: snapshot.isPaid,
      paymentStatus: snapshot.paymentStatus,
      paymentMethod: snapshot.paymentMethod,
      total: snapshot.total,
      paidAmount: snapshot.paidAmount,
      remainingBalance: snapshot.remainingBalance,
      paymentTimestamp: snapshot.paymentTimestamp,
      voidReason: snapshot.voidReason,
      orderType: snapshot.orderType,
      tableNumber: snapshot.tableNumber,
      employeeId: snapshot.employeeId,
      sourceType: snapshot.sourceType,
      stockDeducted: snapshot.stockDeducted,
      isRevenueConfirmed: snapshot.isRevenueConfirmed,
      items: snapshot.items,
      aggregateVersion: snapshot.aggregateVersion,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    };
    return new InCafeOrder(state);
  }

  transitionTo(target: string, userRole?: string): void {
    if (this.state.status === InCafeOrderStatus.VOID) {
      throw new InvalidInCafeOrderTransitionError(this.state.id, this.state.status, target);
    }
    const rule = IN_CAFE_ORDER_TRANSITIONS[this.state.status];
    if (!rule || !rule.next.includes(target)) {
      throw new InvalidInCafeOrderTransitionError(this.state.id, this.state.status, target);
    }
    if (userRole && !rule.allowedRoles.includes(userRole)) {
      throw new InCafeOrderRoleNotAllowedError(this.state.id, this.state.status, target, userRole);
    }
    this.commit({ status: target });
  }

  hold(reason?: string): void {
    if (this.state.status === InCafeOrderStatus.VOID || this.state.status === InCafeOrderStatus.COMPLETED) {
      throw new InCafeOrderCannotHoldError(this.state.id, 'Cannot hold a voided or completed order');
    }
    if (this.state.status === InCafeOrderStatus.ON_HOLD) {
      throw new InCafeOrderAlreadyOnHoldError();
    }
    if (this.state.status !== InCafeOrderStatus.NEW && this.state.status !== InCafeOrderStatus.PREPARING) {
      throw new InCafeOrderCannotHoldError(this.state.id, 'Can only hold orders in NEW or PREPARING status');
    }
    this.commit({ status: InCafeOrderStatus.ON_HOLD });
  }

  resume(): void {
    if (this.state.status !== InCafeOrderStatus.ON_HOLD) {
      throw new InCafeOrderNotOnHoldError();
    }
    this.commit({ status: InCafeOrderStatus.PREPARING });
  }

  cancel(reason: string): void {
    if (this.state.status === InCafeOrderStatus.VOID || this.state.status === InCafeOrderStatus.COMPLETED) {
      throw new InCafeOrderCannotCancelError(this.state.id, 'Cannot cancel a voided or completed order');
    }
    if (this.state.status !== InCafeOrderStatus.NEW) {
      throw new InCafeOrderCannotCancelError(
        this.state.id,
        'Can only cancel orders in NEW status. Use void for orders already in progress.',
      );
    }
    this.commit({ status: InCafeOrderStatus.VOID, voidReason: reason });
  }

  void(reason: string): void {
    if (this.state.status === InCafeOrderStatus.VOID) {
      throw new InCafeOrderCannotVoidError(this.state.id, 'Order is already voided');
    }
    this.commit({ status: InCafeOrderStatus.VOID, voidReason: reason });
  }

  updatePayment(payment: PaymentUpdateInput): void {
    if (this.state.status === InCafeOrderStatus.VOID) {
      throw new InCafeOrderCannotPayError(this.state.id, 'Cannot update payment for voided order');
    }

    const effectivePaidAmount =
      payment.paymentStatus === PaymentStatus.PAID && payment.paidAmount === 0
        ? Number(this.state.total)
        : payment.paidAmount;
    const remainingBalance = Math.max(0, Number(this.state.total) - effectivePaidAmount);

    this.commit({
      paymentStatus: payment.paymentStatus,
      paymentMethod: payment.paymentMethod ?? null,
      paidAmount: String(effectivePaidAmount),
      remainingBalance: String(remainingBalance),
      isPaid: payment.paymentStatus === PaymentStatus.PAID,
      paymentTimestamp: effectivePaidAmount > 0 ? new Date().toISOString() : undefined,
    });
  }

  editItems(items: InCafeOrderItemSnapshot[], newTotal: string, currentPaidAmount: string): void {
    if (this.state.status === InCafeOrderStatus.VOID || this.state.status === InCafeOrderStatus.COMPLETED) {
      throw new InCafeOrderCannotEditError(this.state.id, 'Cannot edit a voided or completed order');
    }
    if (this.state.status === InCafeOrderStatus.DELIVERED) {
      throw new InCafeOrderCannotEditError(this.state.id, 'Cannot edit a delivered order');
    }
    if (this.state.paymentStatus === PaymentStatus.PAID) {
      throw new InCafeOrderCannotEditError(this.state.id, 'Cannot edit a paid order. Void and recreate instead.');
    }
    const newRemaining = Math.max(0, Number(newTotal) - Number(currentPaidAmount));
    this.commit({
      items,
      total: newTotal,
      remainingBalance: String(newRemaining),
    });
  }

  updateNote(notes: string | null): void {
    this.commit({ notes: notes ?? null });
  }

  assignCustomer(input: { customerId?: string; customerName?: string; customerPhone?: string }): void {
    this.commit({
      customerId: input.customerId ?? this.state.customerId,
      customerName: input.customerName ?? this.state.customerName,
      customerPhone: input.customerPhone ?? this.state.customerPhone,
    });
  }

  markStockDeducted(deducted: boolean): void {
    this.commit({ stockDeducted: deducted });
  }

  private commit(patch: Partial<InCafeOrderState>): void {
    const now = new Date().toISOString();
    Object.assign(this.state, patch, { updatedAt: now });
    this.state.aggregateVersion++;
  }

  toSnapshot(): InCafeOrderSnapshot {
    return InCafeOrderSerializer.addChecksum({
      snapshotSchemaVersion: CURRENT_IN_CAFE_ORDER_SNAPSHOT_SCHEMA_VERSION,
      aggregateVersion: this.state.aggregateVersion,
      id: this.state.id,
      cafeId: this.state.cafeId,
      branchId: this.state.branchId,
      code: this.state.code,
      customerName: this.state.customerName,
      customerPhone: this.state.customerPhone,
      customerId: this.state.customerId,
      notes: this.state.notes,
      createdById: this.state.createdById,
      status: this.state.status,
      isPaid: this.state.isPaid,
      paymentStatus: this.state.paymentStatus,
      paymentMethod: this.state.paymentMethod,
      total: this.state.total,
      paidAmount: this.state.paidAmount,
      remainingBalance: this.state.remainingBalance,
      paymentTimestamp: this.state.paymentTimestamp,
      voidReason: this.state.voidReason,
      orderType: this.state.orderType,
      tableNumber: this.state.tableNumber,
      employeeId: this.state.employeeId,
      sourceType: this.state.sourceType,
      stockDeducted: this.state.stockDeducted,
      isRevenueConfirmed: this.state.isRevenueConfirmed,
      items: this.state.items,
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt,
    });
  }

  get id(): string {
    return this.state.id;
  }

  get cafeId(): string {
    return this.state.cafeId;
  }

  get branchId(): string {
    return this.state.branchId;
  }

  get code(): string {
    return this.state.code;
  }

  get status(): string {
    return this.state.status;
  }

  get paymentStatus(): string {
    return this.state.paymentStatus;
  }

  get aggregateVersion(): number {
    return this.state.aggregateVersion;
  }

  get total(): string {
    return this.state.total;
  }

  get items(): InCafeOrderItemSnapshot[] {
    return this.state.items;
  }

  get stockDeducted(): boolean {
    return this.state.stockDeducted;
  }
}
