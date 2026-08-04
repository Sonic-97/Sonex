import { Order } from '../domain/order.aggregate';
import { OrderSerializer } from '../domain/order.snapshot';
import { OrderMapper } from '../infrastructure/order.mapper';
import { OrderRepositoryImpl } from '../infrastructure/order.repository.impl';
import { InMemoryOrderStore } from '../infrastructure/order.in-memory-store';
import { OrderApplicationService } from '../application/order.application';
import { OrderStatus } from '../dto/update-order-status.dto';
import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OrderRoleNotAllowedError,
  OrderTenantMismatchError,
} from '../domain/order.errors';

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    cafeId: 'cafe-1',
    branchId: 'branch-1',
    customerId: 'customer-1',
    code: 'CAF-20260101-ABCDE',
    type: 'TAKEAWAY',
    source: 'IN_CAFE',
    sourceType: 'INSIDE_CAFE',
    total: '50.00',
    items: [{ productId: 'product-1', quantity: 2, unitPrice: '25.00', notes: null }],
    ...overrides,
  };
}

describe('Order Aggregate', () => {
  it('creates a NEW order with version 1', () => {
    const order = Order.create(makeDraft());
    expect(order.status).toBe(OrderStatus.NEW);
    expect(order.aggregateVersion).toBe(1);
    expect(order.total).toBe('50.00');
  });

  it('applies default source/sourceType when omitted', () => {
    const order = Order.create(makeDraft({ source: undefined, sourceType: undefined }));
    expect((order as any).toSnapshot().source).toBe('IN_CAFE');
    expect((order as any).toSnapshot().sourceType).toBe('INSIDE_CAFE');
  });

  it('transitions NEW -> CONFIRMED and records confirmedAt', () => {
    const order = Order.create(makeDraft());
    order.transitionTo(OrderStatus.CONFIRMED, 'BARISTA');
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.aggregateVersion).toBe(2);
    expect((order as any).toSnapshot().confirmedAt).not.toBeNull();
  });

  it('sets paymentStatus PAID on transition to PAID', () => {
    const order = Order.create(makeDraft());
    order.transitionTo(OrderStatus.CONFIRMED, 'BARISTA');
    order.transitionTo(OrderStatus.PREPARING, 'BARISTA');
    order.transitionTo(OrderStatus.READY, 'BARISTA');
    order.transitionTo(OrderStatus.PICKED_UP, 'Cafe');
    order.transitionTo(OrderStatus.DELIVERED, 'DELIVERY');
    order.transitionTo(OrderStatus.PAID, 'Cafe');
    expect(order.status).toBe(OrderStatus.PAID);
    expect((order as any).toSnapshot().paymentStatus).toBe('PAID');
  });

  it('rejects an invalid transition', () => {
    const order = Order.create(makeDraft());
    expect(() => order.transitionTo(OrderStatus.READY, 'BARISTA')).toThrow(InvalidOrderTransitionError);
  });

  it('rejects a transition from a terminal status', () => {
    const order = Order.create(makeDraft());
    order.cancel();
    expect(() => order.transitionTo(OrderStatus.CONFIRMED, 'BARISTA')).toThrow(InvalidOrderTransitionError);
  });

  it('rejects a transition when the role is not allowed', () => {
    const order = Order.create(makeDraft());
    expect(() => order.transitionTo(OrderStatus.CONFIRMED, 'WAITER')).toThrow(OrderRoleNotAllowedError);
  });

  it('cancels an order and records cancelledAt', () => {
    const order = Order.create(makeDraft());
    order.cancel();
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.aggregateVersion).toBe(2);
    expect((order as any).toSnapshot().cancelledAt).not.toBeNull();
  });

  it('is a no-op when already cancelled', () => {
    const order = Order.create(makeDraft());
    order.cancel();
    const version = order.aggregateVersion;
    order.cancel();
    expect(order.aggregateVersion).toBe(version);
  });

  it('rehydrates from snapshot preserving state', () => {
    const original = Order.create(makeDraft());
    original.transitionTo(OrderStatus.CONFIRMED, 'BARISTA');
    const rehydrated = Order.rehydrate(original.toSnapshot());
    expect(rehydrated.status).toBe(OrderStatus.CONFIRMED);
    expect(rehydrated.aggregateVersion).toBe(2);
    expect(rehydrated.id).toBe(original.id);
  });
});

describe('OrderSerializer', () => {
  it('round-trips checksum validation', () => {
    const order = Order.create(makeDraft());
    const snapshot = order.toSnapshot();
    expect(OrderSerializer.validateChecksum(snapshot)).toBe(true);
  });

  it('rejects a corrupted snapshot', () => {
    const order = Order.create(makeDraft());
    const json = OrderSerializer.storeJson(order.toSnapshot());
    const corrupted = json.replace(OrderStatus.NEW, OrderStatus.PAID);
    expect(() => OrderSerializer.deserialize(corrupted)).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => OrderSerializer.deserialize(JSON.stringify({}))).toThrow();
  });
});

describe('OrderRepositoryImpl', () => {
  let store: InMemoryOrderStore;
  let mapper: OrderMapper;
  let repository: OrderRepositoryImpl;

  beforeEach(() => {
    store = new InMemoryOrderStore();
    mapper = new OrderMapper();
    repository = new OrderRepositoryImpl(store, mapper);
  });

  it('save persists and findById retrieves', async () => {
    const order = Order.create(makeDraft());
    await repository.save(order);
    const loaded = await repository.findById(order.id);
    expect(loaded.id).toBe(order.id);
    expect(loaded.status).toBe(OrderStatus.NEW);
  });

  it('findById throws for a missing order', async () => {
    await expect(repository.findById('missing')).rejects.toThrow(OrderNotFoundError);
  });

  it('findById throws when the store record version mismatches the snapshot', async () => {
    const order = Order.create(makeDraft());
    await repository.save(order);
    const record = store.records.get(order.id)!;
    store.records.set(order.id, { ...record, aggregateVersion: record.aggregateVersion + 1 });
    await expect(repository.findById(order.id)).rejects.toThrow();
  });
});

describe('OrderApplicationService', () => {
  let store: InMemoryOrderStore;
  let mapper: OrderMapper;
  let repository: OrderRepositoryImpl;
  let service: OrderApplicationService;

  beforeEach(() => {
    store = new InMemoryOrderStore();
    mapper = new OrderMapper();
    repository = new OrderRepositoryImpl(store, mapper);
    service = new OrderApplicationService(repository);
  });

  it('createOrder persists an order', async () => {
    const order = await service.createOrder(makeDraft());
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe(OrderStatus.NEW);
  });

  it('transitionStatus returns changed=false for the same status', async () => {
    const order = await service.createOrder(makeDraft());
    const result = await service.transitionStatus(order.id, OrderStatus.NEW, 'BARISTA');
    expect(result.changed).toBe(false);
    expect(result.from).toBe(OrderStatus.NEW);
  });

  it('transitionStatus transitions and returns from/to', async () => {
    const order = await service.createOrder(makeDraft());
    const result = await service.transitionStatus(order.id, OrderStatus.CONFIRMED, 'BARISTA');
    expect(result.changed).toBe(true);
    expect(result.from).toBe(OrderStatus.NEW);
    expect(result.to).toBe(OrderStatus.CONFIRMED);
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe(OrderStatus.CONFIRMED);
    expect(loaded.aggregateVersion).toBe(2);
  });

  it('transitionStatus rejects a cafe tenant mismatch', async () => {
    const order = await service.createOrder(makeDraft());
    await expect(service.transitionStatus(order.id, OrderStatus.CONFIRMED, 'BARISTA', { cafeId: 'cafe-other' }))
      .rejects.toThrow(OrderTenantMismatchError);
  });

  it('transitionStatus rejects a branch tenant mismatch', async () => {
    const order = await service.createOrder(makeDraft());
    await expect(service.transitionStatus(order.id, OrderStatus.CONFIRMED, 'BARISTA', { branchId: 'branch-other' }))
      .rejects.toThrow(OrderTenantMismatchError);
  });

  it('cancel marks the order cancelled', async () => {
    const order = await service.createOrder(makeDraft());
    await service.cancel(order.id);
    const loaded = await repository.findById(order.id);
    expect(loaded.status).toBe(OrderStatus.CANCELLED);
  });

  it('cancel is idempotent when already cancelled', async () => {
    const order = await service.createOrder(makeDraft());
    await service.cancel(order.id);
    const version = (await repository.findById(order.id)).aggregateVersion;
    await service.cancel(order.id);
    expect((await repository.findById(order.id)).aggregateVersion).toBe(version);
  });
});
