import type { AggregateRepository } from '../shared-kernel';
import type { AvailabilitySnapshot, CapacityPolicy, ReservationCapacity } from './availability.aggregates';
import type { AvailabilitySnapshotId, CapacityPolicyAggregateId, ReservationCapacityAggregateId } from './availability.types';
export interface AvailabilitySnapshotRepository extends AggregateRepository<AvailabilitySnapshot, AvailabilitySnapshotId> {}
export interface CapacityPolicyRepository extends AggregateRepository<CapacityPolicy, CapacityPolicyAggregateId> {}
export interface ReservationCapacityRepository extends AggregateRepository<ReservationCapacity, ReservationCapacityAggregateId> {}
