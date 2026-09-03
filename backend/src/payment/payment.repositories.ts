import type { AggregateRepository } from '../shared-kernel';
import type { PaymentIntent, Settlement } from './payment.aggregates';
import type { PaymentIntentId, SettlementId } from './payment.types';
export interface PaymentIntentRepository extends AggregateRepository<PaymentIntent, PaymentIntentId> {}
export interface SettlementRepository extends AggregateRepository<Settlement, SettlementId> {}
