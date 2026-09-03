import { domainId, type AggregateId } from '../shared-kernel';

export type AvailabilitySnapshotId = AggregateId<'AvailabilitySnapshotId'>;
export type CapacityPolicyAggregateId = AggregateId<'CapacityPolicyAggregateId'>;
export type ReservationCapacityAggregateId = AggregateId<'ReservationCapacityAggregateId'>;
export type CapacityFenceId = AggregateId<'CapacityFenceId'>;

export const availabilitySnapshotId = (value: string): AvailabilitySnapshotId => domainId('AvailabilitySnapshotId', value);
export const capacityPolicyAggregateId = (value: string): CapacityPolicyAggregateId => domainId('CapacityPolicyAggregateId', value);
export const reservationCapacityAggregateId = (value: string): ReservationCapacityAggregateId => domainId('ReservationCapacityAggregateId', value);
export const capacityFenceId = (value: string): CapacityFenceId => domainId('CapacityFenceId', value);
