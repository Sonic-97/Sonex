import { domainId, type AggregateId } from '../shared-kernel';
export type OrderId = AggregateId<'OrderId'>;
export type CheckoutId = AggregateId<'CheckoutId'>;
export const orderId = (value: string): OrderId => domainId('OrderId', value);
export const checkoutId = (value: string): CheckoutId => domainId('CheckoutId', value);
