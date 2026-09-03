import { domainId, type AggregateId } from '../shared-kernel';
export type ReservationId = AggregateId<'ReservationId'>;
export type ReservationRequestId = AggregateId<'ReservationRequestId'>;
export type ReservationLifecycleId = AggregateId<'ReservationLifecycleId'>;
export type ReservationAllocationId = AggregateId<'ReservationAllocationId'>;
export const reservationId = (value: string): ReservationId => domainId('ReservationId', value);
export const reservationRequestId = (value: string): ReservationRequestId => domainId('ReservationRequestId', value);
export const reservationLifecycleId = (value: string): ReservationLifecycleId => domainId('ReservationLifecycleId', value);
export const reservationAllocationId = (value: string): ReservationAllocationId => domainId('ReservationAllocationId', value);
