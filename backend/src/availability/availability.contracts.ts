import type { Command, DomainEvent, Instant, Query, TenantId } from '../shared-kernel';
import type { InventoryItemId, StorageLocationId } from '../inventory-core';
import type { InventoryLedgerReadPort, LedgerStockSnapshot } from '../inventory-ledger';
import type { AvailabilitySnapshotId, CapacityFenceId, CapacityPolicyAggregateId, ReservationCapacityAggregateId } from './availability.types';
import type { AllocationPolicy, AvailabilityReason, AvailabilityWindow, CapacityFence, CapacityPolicyId, ReservableQuantity, SafetyBuffer } from './availability.value-objects';

export type AvailabilityEventName = 'AvailabilityCalculated' | 'AvailabilityChanged' | 'CapacityReserved' | 'CapacityReleased' | 'CapacityPolicyUpdated' | 'CapacityExceeded';
export type AvailabilityEventPayload = Readonly<Record<string, string>> & { readonly tenantId: string; readonly snapshotId: string; readonly occurredAt: string };
export type AvailabilityDomainEvent = DomainEvent<AvailabilityEventName, AvailabilityEventPayload>;
export type RefreshAvailability = Command<'AVAILABILITY_REFRESH', { readonly snapshotId: AvailabilitySnapshotId; readonly ledger: LedgerStockSnapshot; readonly policyId: CapacityPolicyId }>;
export type ReserveCapacity = Command<'AVAILABILITY_RESERVE_CAPACITY', { readonly snapshotId: AvailabilitySnapshotId; readonly reservationId: ReservationCapacityAggregateId; readonly requested: ReservableQuantity }>;
export type ReleaseCapacity = Command<'AVAILABILITY_RELEASE_CAPACITY', { readonly snapshotId: AvailabilitySnapshotId; readonly reservationId: ReservationCapacityAggregateId }>;
export type RecalculateAvailability = Command<'AVAILABILITY_RECALCULATE', { readonly snapshotId: AvailabilitySnapshotId; readonly ledger: LedgerStockSnapshot }>;
export type UpdateCapacityPolicy = Command<'AVAILABILITY_UPDATE_POLICY', { readonly policyId: CapacityPolicyId; readonly safetyBuffer: SafetyBuffer; readonly capacityFence: CapacityFence; readonly allocationPolicy: AllocationPolicy; readonly window: AvailabilityWindow }>;
export type CanReserveQuery = Query<'AVAILABILITY_CAN_RESERVE', { readonly itemId: InventoryItemId; readonly storageLocationId: StorageLocationId; readonly requested: ReservableQuantity }>;
export type AvailableCapacityQuery = Query<'AVAILABILITY_AVAILABLE_CAPACITY', { readonly itemId: InventoryItemId; readonly storageLocationId: StorageLocationId }>;
export type CapacityBreakdownQuery = Query<'AVAILABILITY_CAPACITY_BREAKDOWN', { readonly snapshotId: AvailabilitySnapshotId }>;
export type AvailabilityStatusQuery = Query<'AVAILABILITY_STATUS', { readonly snapshotId: AvailabilitySnapshotId }>;
export type AvailabilityTimelineQuery = Query<'AVAILABILITY_TIMELINE', { readonly itemId: InventoryItemId; readonly storageLocationId: StorageLocationId }>;
export interface AvailabilityReadPort { readonly ledger: InventoryLedgerReadPort; }
export interface AvailabilityScope { readonly tenantId: TenantId; readonly occurredAt: Instant; }
export interface CapacityBreakdown { readonly ledgerSequence: number; readonly onHandQuantity: string; readonly reservationHoldQuantity: string; readonly safetyBuffer: string; readonly capacityFence: string; readonly policyAdjustment: string; readonly reservableQuantity: string; readonly unit: string; }
export interface PromiseDecision { readonly canPromise: boolean; readonly reason: AvailabilityReason; readonly capacity: ReservableQuantity; }
