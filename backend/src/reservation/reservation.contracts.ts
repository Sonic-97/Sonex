import type { Command, DomainEvent, Instant, Query, TenantId } from '../shared-kernel';
import type { PromiseDecision } from '../availability';
import type { InventoryLedgerReadPort } from '../inventory-ledger';
import type { InventoryItemId, StorageLocationId } from '../inventory-core';
import type { ReservationAllocationId, ReservationId } from './reservation.types';
import type { ReservationExpiry, ReservationQuantity, ReservationReason, ReservationReference, ReservationStatus, ReservationToken } from './reservation.value-objects';

export type ReservationEventName = 'ReservationCreated' | 'ReservationAuthorized' | 'ReservationConfirmed' | 'ReservationCancelled' | 'ReservationExpired' | 'ReservationReleased';
export type ReservationEventPayload = Readonly<Record<string, string>> & { readonly tenantId: string; readonly reservationId: string; readonly occurredAt: string };
export type ReservationDomainEvent = DomainEvent<ReservationEventName, ReservationEventPayload>;
export type CreateReservation = Command<'RESERVATION_CREATE', { readonly reservationId: ReservationId; readonly itemId: InventoryItemId; readonly storageLocationId: StorageLocationId; readonly quantity: ReservationQuantity; readonly reference: ReservationReference; readonly expiry: ReservationExpiry; readonly token: ReservationToken }>;
export type ConfirmReservation = Command<'RESERVATION_CONFIRM', { readonly reservationId: ReservationId }>;
export type CancelReservation = Command<'RESERVATION_CANCEL', { readonly reservationId: ReservationId; readonly reason: ReservationReason }>;
export type ExpireReservation = Command<'RESERVATION_EXPIRE', { readonly reservationId: ReservationId }>;
export type ExtendReservation = Command<'RESERVATION_EXTEND', { readonly reservationId: ReservationId; readonly expiry: ReservationExpiry }>;
export type ReleaseReservation = Command<'RESERVATION_RELEASE', { readonly reservationId: ReservationId; readonly reason: ReservationReason }>;
export type ReservationStatusQuery = Query<'RESERVATION_STATUS', { readonly reservationId: ReservationId }>;
export type ReservationHistoryQuery = Query<'RESERVATION_HISTORY', { readonly reservationId: ReservationId }>;
export type ReservationTimelineQuery = Query<'RESERVATION_TIMELINE', { readonly reservationId: ReservationId }>;
export type ReservationByReferenceQuery = Query<'RESERVATION_BY_REFERENCE', { readonly reference: ReservationReference }>;
export interface ReservationLedgerReadPort { readonly ledger: InventoryLedgerReadPort; }
export interface ReservationAuthorization { readonly decision: PromiseDecision; readonly allocationId: ReservationAllocationId; readonly authorizedAt: Instant; }
export interface ReservationScope { readonly tenantId: TenantId; readonly occurredAt: Instant; }
