import type { AggregateRepository } from '../shared-kernel';
import type { CheckoutSession, CustomerOrder } from './commerce.aggregates';
import type { CheckoutId, OrderId } from './commerce.types';
export interface CustomerOrderRepository extends AggregateRepository<CustomerOrder, OrderId> {}
export interface CheckoutSessionRepository extends AggregateRepository<CheckoutSession, CheckoutId> {}
