import { DomainService, type Instant } from '../shared-kernel';
import type { PromiseDecision } from '../availability';
import type { ResolvedPrice } from '../pricing-domain';
import type { ReservationId } from '../reservation';
import { CustomerOrder } from './commerce.aggregates';
import { commerceInvariant } from './commerce.errors';

export class CheckoutCoordinator extends DomainService { validate(order: CustomerOrder, price: ResolvedPrice, at: Instant): void { order.validate(price, at); } requestAvailability(order: CustomerOrder, at: Instant): void { order.requestAvailability(at); } }
export class CommerceOrchestrator extends DomainService { authorizeReservation(order: CustomerOrder, reservationId: ReservationId, decision: PromiseDecision, at: Instant): void { order.authorizeReservation(reservationId, decision, at); } finalize(order: CustomerOrder, at: Instant): void { order.finalize(at); } }
export class OrderValidator extends DomainService { validate(order: CustomerOrder): void { if (order.status.value === 'CONFIRMED' && (!order.price || !order.reservationId)) commerceInvariant('COMMERCE_ORDER_INCONSISTENT', 'Confirmed order requires price and reservation snapshots'); } }
export class OrderConsistencyValidator extends OrderValidator {}
