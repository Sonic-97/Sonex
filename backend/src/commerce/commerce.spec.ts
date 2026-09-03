import { instant, Money, tenantId } from '../shared-kernel';
import { AvailabilityReason, ReservableQuantity, type PromiseDecision } from '../availability';
import { productId } from '../catalog-domain';
import type { ResolvedPrice } from '../pricing-domain';
import { reservationId } from '../reservation';
import { CheckoutSession, CustomerOrder, OrderIntent } from './commerce.aggregates';
import { CommerceDomainError } from './commerce.errors';
import { CheckoutCoordinator, CommerceOrchestrator, OrderConsistencyValidator } from './commerce.services';
import { checkoutId, orderId } from './commerce.types';
import { CheckoutExpiry, CheckoutToken, CustomerIntent, OrderChannel, OrderReference, OrderSource } from './commerce.value-objects';

const now = instant('2026-07-30T00:00:00.000Z');
const later = instant('2026-07-30T01:00:00.000Z');
const product = productId('latte');
const price: ResolvedPrice = Object.freeze({ productId: product, currency: 'EGP', unitPrice: Money.from('40', 'EGP'), subtotal: Money.from('40', 'EGP'), discounts: Object.freeze([]), taxes: Object.freeze([]), serviceCharges: Object.freeze([]), total: Money.from('40', 'EGP'), trace: Object.freeze(['PRICE_RULE:standard']) });
const decision = (canPromise = true): PromiseDecision => Object.freeze({ canPromise, reason: AvailabilityReason.from(canPromise ? 'AVAILABLE' : 'INSUFFICIENT_CAPACITY'), capacity: ReservableQuantity.from('2', 'UNIT') });
const create = (expiry = later) => { const checkout = CheckoutSession.create(tenantId('tenant-1'), checkoutId('checkout-1'), CheckoutToken.from('checkout-token'), CheckoutExpiry.at(expiry)); const intent = new OrderIntent(orderId('order-1'), product, CustomerIntent.from('1', 'UNIT'), OrderReference.from('reference-1'), OrderSource.from('POS'), OrderChannel.from('IN_STORE')); return CustomerOrder.create(tenantId('tenant-1'), orderId('order-1'), checkout.id, intent, checkout, now); };

describe('Commerce Orchestrator Domain', () => {
  test('coordinates an order through pricing, availability, reservation, and confirmation without calculating them', () => {
    const order = create(); const coordinator = new CheckoutCoordinator(); const orchestrator = new CommerceOrchestrator();
    coordinator.validate(order, price, now); coordinator.requestAvailability(order, now); orchestrator.authorizeReservation(order, reservationId('reservation-1'), decision(), now); orchestrator.finalize(order, now);
    expect(order.snapshot()).toMatchObject({ status: 'CONFIRMED', productId: product, reservationId: reservationId('reservation-1') });
    expect(new OrderConsistencyValidator().validate(order)).toBeUndefined();
    expect(order.pullDomainEvents().map((event) => event.name)).toEqual(['OrderCreated', 'OrderValidated', 'AvailabilityRequested', 'ReservationAuthorized', 'OrderConfirmed']);
  });
  test('forbids confirmation until availability and reservation authorization complete', () => {
    const order = create();
    expect(() => order.finalize(now)).toThrow(CommerceDomainError);
    order.validate(price, now); order.requestAvailability(now);
    expect(() => order.authorizeReservation(reservationId('reservation-1'), decision(false), now)).toThrow(CommerceDomainError);
    expect(() => order.finalize(now)).toThrow(CommerceDomainError);
  });
  test('cancellation and checkout expiration prevent further workflow transitions', () => {
    const cancelled = create(); cancelled.cancel(now); expect(() => cancelled.validate(price, now)).toThrow(CommerceDomainError);
    const expired = create(instant('2026-07-30T00:30:00.000Z')); expect(() => expired.validate(price, later)).toThrow(CommerceDomainError); expect(expired.status.value).toBe('EXPIRED'); expect(() => expired.requestAvailability(later)).toThrow(CommerceDomainError);
  });
  test('rejects price snapshots for another product and preserves immutable order identity', () => {
    const order = create(); const other: ResolvedPrice = Object.freeze({ ...price, productId: productId('espresso') });
    expect(() => order.validate(other, now)).toThrow(CommerceDomainError);
    expect(order.id).toBe(orderId('order-1'));
  });
});
