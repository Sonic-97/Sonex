import { domainId, type AggregateId } from '../shared-kernel';

export type InventoryLedgerId = AggregateId<'InventoryLedgerId'>;
export type LedgerEntryId = AggregateId<'LedgerEntryId'>;
export type ReservationHoldId = AggregateId<'ReservationHoldId'>;
export type ReservationReleaseId = AggregateId<'ReservationReleaseId'>;
export type StockAdjustmentId = AggregateId<'StockAdjustmentId'>;
export type TransferId = AggregateId<'TransferId'>;
export type ReceiptId = AggregateId<'ReceiptId'>;
export type WasteEntryId = AggregateId<'WasteEntryId'>;
export type ConsumptionEntryId = AggregateId<'ConsumptionEntryId'>;

export const inventoryLedgerId = (value: string): InventoryLedgerId => domainId('InventoryLedgerId', value);
export const ledgerEntryId = (value: string): LedgerEntryId => domainId('LedgerEntryId', value);
export const reservationHoldId = (value: string): ReservationHoldId => domainId('ReservationHoldId', value);
export const reservationReleaseId = (value: string): ReservationReleaseId => domainId('ReservationReleaseId', value);
export const stockAdjustmentId = (value: string): StockAdjustmentId => domainId('StockAdjustmentId', value);
export const transferId = (value: string): TransferId => domainId('TransferId', value);
export const receiptId = (value: string): ReceiptId => domainId('ReceiptId', value);
export const wasteEntryId = (value: string): WasteEntryId => domainId('WasteEntryId', value);
export const consumptionEntryId = (value: string): ConsumptionEntryId => domainId('ConsumptionEntryId', value);
