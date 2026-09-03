import type { Command, DomainEvent, Instant, Query, SchemaVersion, TenantId } from '../shared-kernel';
import type { InventoryItemId, StorageLocationId } from '../inventory-core';
import type { InventoryLedgerId, LedgerEntryId, ReservationHoldId, TransferId } from './inventory-ledger.types';
import type { AdjustmentReason, LedgerReference, MovementQuantity, MovementReason, ReservationReference, TransferReference } from './inventory-ledger.value-objects';

export type InventoryLedgerEventName = 'StockReceived' | 'StockConsumed' | 'StockReserved' | 'ReservationReleased' | 'StockAdjusted' | 'WasteRecorded' | 'TransferCompleted' | 'LedgerCorrected';
export type InventoryLedgerEventPayload = Readonly<Record<string, string>> & { readonly tenantId: string; readonly ledgerId: string; readonly entryId: string; readonly occurredAt: string };
export type InventoryLedgerDomainEvent = DomainEvent<InventoryLedgerEventName, InventoryLedgerEventPayload>;
export type ReceiveStock = Command<'LEDGER_RECEIVE_STOCK', { readonly ledgerId: InventoryLedgerId; readonly entryId: LedgerEntryId; readonly quantity: MovementQuantity; readonly reference: LedgerReference; readonly reason: MovementReason }>;
export type ConsumeStock = Command<'LEDGER_CONSUME_STOCK', { readonly ledgerId: InventoryLedgerId; readonly entryId: LedgerEntryId; readonly quantity: MovementQuantity; readonly reason: MovementReason }>;
export type ReserveStock = Command<'LEDGER_RESERVE_STOCK', { readonly ledgerId: InventoryLedgerId; readonly holdId: ReservationHoldId; readonly entryId: LedgerEntryId; readonly quantity: MovementQuantity; readonly reference: ReservationReference }>;
export type ReleaseReservation = Command<'LEDGER_RELEASE_RESERVATION', { readonly ledgerId: InventoryLedgerId; readonly holdId: ReservationHoldId; readonly entryId: LedgerEntryId; readonly quantity: MovementQuantity; readonly reference: ReservationReference }>;
export type TransferStock = Command<'LEDGER_TRANSFER_STOCK', { readonly ledgerId: InventoryLedgerId; readonly transferId: TransferId; readonly entryId: LedgerEntryId; readonly quantity: MovementQuantity; readonly reference: TransferReference; readonly destinationLocationId: StorageLocationId }>;
export type AdjustStock = Command<'LEDGER_ADJUST_STOCK', { readonly ledgerId: InventoryLedgerId; readonly entryId: LedgerEntryId; readonly quantity: MovementQuantity; readonly reason: AdjustmentReason; readonly increase: boolean }>;
export type RecordWaste = Command<'LEDGER_RECORD_WASTE', { readonly ledgerId: InventoryLedgerId; readonly entryId: LedgerEntryId; readonly quantity: MovementQuantity; readonly reason: MovementReason }>;
export type CorrectLedger = Command<'LEDGER_CORRECT', { readonly ledgerId: InventoryLedgerId; readonly entryId: LedgerEntryId; readonly correctionOf: LedgerEntryId; readonly quantity: MovementQuantity; readonly reason: MovementReason; readonly increase: boolean }>;
export type MovementHistoryQuery = Query<'LEDGER_MOVEMENT_HISTORY', { readonly ledgerId: InventoryLedgerId }>;
export type CurrentStockQuery = Query<'LEDGER_CURRENT_STOCK', { readonly itemId: InventoryItemId; readonly storageLocationId: StorageLocationId }>;
export type StockTimelineQuery = Query<'LEDGER_STOCK_TIMELINE', { readonly ledgerId: InventoryLedgerId; readonly from?: Instant; readonly to?: Instant }>;
export type AdjustmentHistoryQuery = Query<'LEDGER_ADJUSTMENT_HISTORY', { readonly ledgerId: InventoryLedgerId }>;
export type ReservationHistoryQuery = Query<'LEDGER_RESERVATION_HISTORY', { readonly ledgerId: InventoryLedgerId }>;
export type TransferHistoryQuery = Query<'LEDGER_TRANSFER_HISTORY', { readonly ledgerId: InventoryLedgerId }>;
export type WasteHistoryQuery = Query<'LEDGER_WASTE_HISTORY', { readonly ledgerId: InventoryLedgerId }>;
export interface InventoryLedgerScope { readonly tenantId: TenantId; readonly itemId: InventoryItemId; readonly storageLocationId: StorageLocationId; }

/**
 * Immutable, versioned Ledger facts at one replayable sequence point.
 * This contract deliberately excludes Availability policy and promise decisions.
 */
export type LedgerStockSnapshot = Readonly<{
  readonly contractVersion: SchemaVersion;
  readonly tenantId: TenantId;
  readonly ledgerId: InventoryLedgerId;
  readonly inventoryItemId: InventoryItemId;
  readonly storageLocationId: StorageLocationId;
  readonly unit: string;
  readonly onHandQuantity: string;
  readonly reservationHoldQuantity: string;
  readonly ledgerSequence: number;
  readonly snapshotVersion: number;
  readonly asOf: Instant;
}>;

/** Public CQRS boundary for consumers that need Ledger facts without aggregate access. */
export interface InventoryLedgerReadPort {
  getCurrentStock(query: CurrentStockQuery): Promise<LedgerStockSnapshot | undefined>;
}
