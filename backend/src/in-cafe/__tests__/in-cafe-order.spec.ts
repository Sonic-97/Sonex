import { InCafeOrder } from '../domain/in-cafe-order.aggregate';
import { InCafeOrderSerializer } from '../domain/in-cafe-order.snapshot';
import { InCafeOrderMapper } from '../infrastructure/in-cafe-order.mapper';
import { InCafeOrderRepositoryImpl } from '../infrastructure/in-cafe-order.repository.impl';
import { InMemoryInCafeOrderStore } from '../infrastructure/in-cafe-order.in-memory-store';
import { InCafeOrderApplicationService } from '../application/in-cafe-order.application';
import { PaymentStatus } from '../dto/update-payment.dto';
import {
  InvalidInCafeOrderTransitionError,
  InCafeOrderNotFoundError,
  InCafeOrderTenantMismatchError,
  InCafeOrderCannotCancelError,
  InCafeOrderCannotHoldError,
  InCafeOrderCannotVoidError,
  InCafeOrderAlreadyOnHoldError,
  InCafeOrderNotOnHoldError,
  InCafeOrderCannotEditError,
  InCafeOrderCannotPayError,
} from '../domain/in-cafe-order.errors';

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    cafeId: 'cafe-1',
    branchId: 'branch-1',
    code: 'CF-20260101-0001',
    customerName: 'Walk-in Customer',
    customerPhone: null,
    customerId: null,
    notes: null,
    createdById: 'staff-1',
    orderType: 'DINE_IN',
    tableNumber: null,
    employeeId: null,
    sourceType: 'INSIDE_CAFE',
    total: '50.00',
    paymentStatus: PaymentStatus.NOT_PAID,
    paymentMethod: null,
    isPaid: false,
    paidAmount: '0',
    remainingBalance: '50.00',
    items: [{ productId: 'product-1', quantity: 2, unitPrice: '25.00', notes: null, selectedOptions: [] }],
    ...overrides,
  };
}

describe('InCafeOrder Aggregate', () => {
  it('creates a NEW order with version 1', () => {
    const order = InCafeOrder.create(makeDraft());
    expect(order.status).toBe('NEW');
    expect(order.aggregateVersion).toBe(1);
    expect(order.total).toBe('50.00');
    expect(order.paymentStatus).toBe(PaymentStatus.NOT_PAID);
  });

  it('applies default payment fields when creating a paid order', () => {
    const order = InCafeOrder.create(makeDraft({ paymentStatus: PaymentStatus.PAID, isPaid: true, paidAmount: '50.00', remainingBalance: '0' }));
    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect((order as any).toSnapshot().isPaid).toBe(true);
  });

  it('transitions NEW -> PREPARING', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('PREPARING');
    expect(order.status).toBe('PREPARING');
    expect(order.aggregateVersion).toBe(2);
  });

  it('transitions NEW -> ON_HOLD', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('ON_HOLD');
    expect(order.status).toBe('ON_HOLD');
  });

  it('transitions through the full lifecycle', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('PREPARING');
    order.transitionTo('READY');
    order.transitionTo('DELIVERED');
    order.transitionTo('COMPLETED');
    expect(order.status).toBe('COMPLETED');
  });

  it('rejects an invalid transition NEW -> DELIVERED', () => {
    const order = InCafeOrder.create(makeDraft());
    expect(() => order.transitionTo('DELIVERED')).toThrow(InvalidInCafeOrderTransitionError);
  });

  it('rejects a transition from a terminal status', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('PREPARING');
    order.transitionTo('READY');
    order.transitionTo('DELIVERED');
    order.transitionTo('COMPLETED');
    expect(() => order.transitionTo('PREPARING')).toThrow(InvalidInCafeOrderTransitionError);
  });

  it('rejects a transition from a voided order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.void('mistake');
    expect(() => order.transitionTo('PREPARING')).toThrow(InvalidInCafeOrderTransitionError);
  });

  it('holds a NEW order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.hold();
    expect(order.status).toBe('ON_HOLD');
  });

  it('rejects holding a COMPLETED order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('PREPARING');
    order.transitionTo('READY');
    order.transitionTo('DELIVERED');
    order.transitionTo('COMPLETED');
    expect(() => order.hold()).toThrow(InCafeOrderCannotHoldError);
  });

  it('rejects holding an already-held order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.hold();
    expect(() => order.hold()).toThrow(InCafeOrderAlreadyOnHoldError);
  });

  it('rejects holding an order not in NEW or PREPARING', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('PREPARING');
    order.transitionTo('READY');
    expect(() => order.hold()).toThrow(InCafeOrderCannotHoldError);
  });

  it('resumes a held order to PREPARING', () => {
    const order = InCafeOrder.create(makeDraft());
    order.hold();
    order.resume();
    expect(order.status).toBe('PREPARING');
  });

  it('rejects resuming an order that is not on hold', () => {
    const order = InCafeOrder.create(makeDraft());
    expect(() => order.resume()).toThrow(InCafeOrderNotOnHoldError);
  });

  it('cancels a NEW order and records the void reason', () => {
    const order = InCafeOrder.create(makeDraft());
    order.cancel('Customer changed mind');
    expect(order.status).toBe('VOID');
    expect((order as any).toSnapshot().voidReason).toBe('Customer changed mind');
  });

  it('rejects cancelling a COMPLETED order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('PREPARING');
    order.transitionTo('READY');
    order.transitionTo('DELIVERED');
    order.transitionTo('COMPLETED');
    expect(() => order.cancel('test')).toThrow(InCafeOrderCannotCancelError);
  });

  it('rejects cancelling an order already in progress', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('PREPARING');
    expect(() => order.cancel('test')).toThrow(InCafeOrderCannotCancelError);
  });

  it('voids an order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.void('test');
    expect(order.status).toBe('VOID');
    expect((order as any).toSnapshot().voidReason).toBe('test');
  });

  it('rejects voiding an already-voided order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.void('test');
    expect(() => order.void('test again')).toThrow(InCafeOrderCannotVoidError);
  });

  it('updates payment to PAID and computes paid amount', () => {
    const order = InCafeOrder.create(makeDraft());
    order.updatePayment({ paymentStatus: PaymentStatus.PAID, paymentMethod: 'CASH', paidAmount: 0 });
    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    const snapshot = (order as any).toSnapshot();
    expect(snapshot.isPaid).toBe(true);
    expect(Number(snapshot.paidAmount)).toBe(50);
    expect(Number(snapshot.remainingBalance)).toBe(0);
    expect(snapshot.paymentTimestamp).not.toBeNull();
  });

  it('updates payment to NOT_PAID and keeps remaining balance', () => {
    const order = InCafeOrder.create(makeDraft());
    order.updatePayment({ paymentStatus: PaymentStatus.NOT_PAID, paymentMethod: null, paidAmount: 0 });
    const snapshot = (order as any).toSnapshot();
    expect(snapshot.isPaid).toBe(false);
    expect(Number(snapshot.remainingBalance)).toBe(50);
  });

  it('rejects payment update for a voided order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.void('test');
    expect(() => order.updatePayment({ paymentStatus: PaymentStatus.PAID, paymentMethod: 'CASH', paidAmount: 0 }))
      .toThrow(InCafeOrderCannotPayError);
  });

  it('edits items and recomputes remaining balance', () => {
    const order = InCafeOrder.create(makeDraft());
    order.editItems([{ productId: 'product-1', quantity: 1, unitPrice: '30.00', notes: null, selectedOptions: [] }], '30.00', '0');
    const snapshot = (order as any).toSnapshot();
    expect(snapshot.total).toBe('30.00');
    expect(snapshot.remainingBalance).toBe('30');
    expect(snapshot.items).toHaveLength(1);
  });

  it('rejects editing a paid order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.updatePayment({ paymentStatus: PaymentStatus.PAID, paymentMethod: 'CASH', paidAmount: 0 });
    expect(() => order.editItems([{ productId: 'product-1', quantity: 1, unitPrice: '30.00', notes: null, selectedOptions: [] }], '30.00', '50.00'))
      .toThrow(InCafeOrderCannotEditError);
  });

  it('rejects editing a delivered order', () => {
    const order = InCafeOrder.create(makeDraft());
    order.transitionTo('PREPARING');
    order.transitionTo('READY');
    order.transitionTo('DELIVERED');
    expect(() => order.editItems([], '0', '0')).toThrow(InCafeOrderCannotEditError);
  });

  it('rehydrates from snapshot preserving state', () => {
    const original = InCafeOrder.create(makeDraft());
    original.transitionTo('PREPARING');
    const rehydrated = InCafeOrder.rehydrate(original.toSnapshot());
    expect(rehydrated.status).toBe('PREPARING');
    expect(rehydrated.aggregateVersion).toBe(2);
    expect(rehydrated.id).toBe(original.id);
  });
});

describe('InCafeOrderSerializer', () => {
  it('round-trips checksum validation', () => {
    const order = InCafeOrder.create(makeDraft());
    const snapshot = order.toSnapshot();
    expect(InCafeOrderSerializer.validateChecksum(snapshot)).toBe(true);
  });

  it('rejects a corrupted snapshot', () => {
    const order = InCafeOrder.create(makeDraft());
    const json = InCafeOrderSerializer.storeJson(order.toSnapshot());
    const corrupted = json.replace('NEW', 'PAID');
    expect(() => InCafeOrderSerializer.deserialize(corrupted)).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => InCafeOrderSerializer.deserialize(JSON.stringify({}))).toThrow();
  });
});

describe('InCafeOrderRepositoryImpl', () => {
  let store: InMemoryInCafeOrderStore;
  let mapper: InCafeOrderMapper;
  let repository: InCafeOrderRepositoryImpl;

  beforeEach(() => {
    store = new InMemoryInCafeOrderStore();
    mapper = new InCafeOrderMapper();
    repository = new InCafeOrderRepositoryImpl(store, mapper);
  });

  it('save persists and findById retrieves', async () => {
    const order = InCafeOrder.create(makeDraft());
    await repository.save(order);
    const loaded = await repository.findById(order.id);
    expect(loaded.id).toBe(order.id);
    expect(loaded.status).toBe('NEW');
  });

  it('findById throws for a missing order', async () => {
    await expect(repository.findById('missing')).rejects.toThrow(InCafeOrderNotFoundError);
  });

  it('findById throws when the store record version mismatches the snapshot', async () => {
    const order = InCafeOrder.create(makeDraft());
    await repository.save(order);
    const record = store.records.get(order.id)!;
    store.records.set(order.id, { ...record, aggregateVersion: record.aggregateVersion + 1 });
    await expect(repository.findById(order.id)).rejects.toThrow();
  });
});

describe('InCafeOrderApplicationService', () => {
  let store: InMemoryInCafeOrderStore;
  let mapper: InCafeOrderMapper;
  let repository: InCafeOrderRepositoryImpl;
  let service: InCafeOrderApplicationService;

  beforeEach(() => {
    store = new InMemoryInCafeOrderStore();
    mapper = new InCafeOrderMapper();
    repository = new InCafeOrderRepositoryImpl(store, mapper);
    service = new InCafeOrderApplicationService(repository);
  });

  it('createOrder persists an order', async () => {
    const order = await service.createOrder(makeDraft());
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe('NEW');
  });

  it('transitionStatus returns changed=false for the same status', async () => {
    const order = await service.createOrder(makeDraft());
    const result = await service.transitionStatus(order.id, 'NEW');
    expect(result.changed).toBe(false);
    expect(result.from).toBe('NEW');
  });

  it('transitionStatus transitions and returns from/to', async () => {
    const order = await service.createOrder(makeDraft());
    const result = await service.transitionStatus(order.id, 'PREPARING');
    expect(result.changed).toBe(true);
    expect(result.from).toBe('NEW');
    expect(result.to).toBe('PREPARING');
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe('PREPARING');
    expect(loaded.aggregateVersion).toBe(2);
  });

  it('transitionStatus rejects a cafe tenant mismatch', async () => {
    const order = await service.createOrder(makeDraft());
    await expect(service.transitionStatus(order.id, 'PREPARING', undefined, { cafeId: 'cafe-other' }))
      .rejects.toThrow(InCafeOrderTenantMismatchError);
  });

  it('transitionStatus rejects a branch tenant mismatch', async () => {
    const order = await service.createOrder(makeDraft());
    await expect(service.transitionStatus(order.id, 'PREPARING', undefined, { branchId: 'branch-other' }))
      .rejects.toThrow(InCafeOrderTenantMismatchError);
  });

  it('hold marks the order ON_HOLD', async () => {
    const order = await service.createOrder(makeDraft());
    await service.hold(order.id);
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe('ON_HOLD');
  });

  it('resume returns a held order to PREPARING', async () => {
    const order = await service.createOrder(makeDraft());
    await service.hold(order.id);
    await service.resume(order.id);
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe('PREPARING');
  });

  it('cancel marks a NEW order VOID', async () => {
    const order = await service.createOrder(makeDraft());
    await service.cancel(order.id, 'Customer changed mind');
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe('VOID');
  });

  it('void marks the order VOID', async () => {
    const order = await service.createOrder(makeDraft());
    await service.void(order.id, 'test');
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe('VOID');
  });

  it('updatePayment persists payment state', async () => {
    const order = await service.createOrder(makeDraft());
    await service.updatePayment(order.id, { paymentStatus: PaymentStatus.PAID, paymentMethod: 'CASH', paidAmount: 0 });
    const loaded = await repository.findById(order.id);
    expect(loaded.paymentStatus).toBe(PaymentStatus.PAID);
  });

  it('editOrder updates items and total', async () => {
    const order = await service.createOrder(makeDraft());
    await service.editOrder(order.id, [{ productId: 'product-1', quantity: 1, unitPrice: '30.00', notes: null, selectedOptions: [] }], '30.00', '0');
    const loaded = await repository.findById(order.id);
    expect(loaded.total).toBe('30.00');
  });

  it('updateNote updates the notes field', async () => {
    const order = await service.createOrder(makeDraft());
    await service.updateNote(order.id, 'New note');
    const loaded = await repository.findById(order.id);
    expect((loaded as any).toSnapshot().notes).toBe('New note');
  });

  it('assignCustomer updates customer fields', async () => {
    const order = await service.createOrder(makeDraft());
    await service.assignCustomer(order.id, { customerName: 'Ahmed', customerPhone: '0100000000' });
    const loaded = await repository.findById(order.id);
    const snapshot = (loaded as any).toSnapshot();
    expect(snapshot.customerName).toBe('Ahmed');
    expect(snapshot.customerPhone).toBe('0100000000');
  });

  it('markStockDeducted updates the stock flag', async () => {
    const order = await service.createOrder(makeDraft());
    await service.markStockDeducted(order.id, true);
    const loaded = await repository.findById(order.id);
    expect(loaded.stockDeducted).toBe(true);
  });

  it('propagates InCafeOrderNotFoundError from findById', async () => {
    await expect(service.transitionStatus('missing', 'PREPARING')).rejects.toThrow(InCafeOrderNotFoundError);
  });
});
