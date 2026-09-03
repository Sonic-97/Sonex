import { instant, tenantId } from '../shared-kernel';
import { inventoryItemId, storageLocationId } from '../inventory-core';
import { InventoryLedger } from './inventory-ledger.aggregates';
import { InventoryLedgerDomainError } from './inventory-ledger.errors';
import { LedgerValidator, SnapshotCalculator, StockCalculator } from './inventory-ledger.services';
import { inventoryLedgerId, ledgerEntryId, reservationHoldId, transferId } from './inventory-ledger.types';
import { AdjustmentReason, LedgerReference, MovementQuantity, MovementReason, ReservationReference, SnapshotVersion, TransferReference } from './inventory-ledger.value-objects';

const now = instant('2026-07-30T00:00:00.000Z');
const ledger = () => InventoryLedger.create(tenantId('tenant-1'), inventoryLedgerId('beans-main'), inventoryItemId('beans'), storageLocationId('main-store'), 'g');
const qty = (value: string) => MovementQuantity.from(value, 'g');
const reason = MovementReason.from('Operational movement');

describe('Inventory Ledger Domain', () => {
  test('is append-only and derives stock solely from immutable movement entries', () => {
    const value = ledger();
    value.receive(ledgerEntryId('receive-1'), qty('100'), LedgerReference.from('PO-1'), reason, now);
    value.consume(ledgerEntryId('consume-1'), qty('18'), reason, now);
    const entries = value.entries;
    expect(entries).toHaveLength(2);
    expect(Object.isFrozen(entries[0])).toBe(true);
    expect(new StockCalculator().calculate(value)).toEqual({ onHand: '82', reserved: '0', available: '82', unit: 'G' });
    expect(() => value.receive(ledgerEntryId('receive-1'), qty('1'), LedgerReference.from('PO-2'), reason, now)).toThrow(InventoryLedgerDomainError);
  });

  test('creates holds and releases as append-only entries without changing on-hand quantity', () => {
    const value = ledger();
    value.receive(ledgerEntryId('receive-1'), qty('100'), LedgerReference.from('PO-1'), reason, now);
    const hold = value.reserve(reservationHoldId('hold-1'), ledgerEntryId('hold-entry-1'), qty('30'), ReservationReference.from('order-1'), now);
    expect(new StockCalculator().calculate(value)).toEqual({ onHand: '100', reserved: '30', available: '70', unit: 'G' });
    value.release(hold.id, ledgerEntryId('release-entry-1'), qty('10'), ReservationReference.from('order-1'), now);
    expect(new StockCalculator().calculate(value)).toEqual({ onHand: '100', reserved: '20', available: '80', unit: 'G' });
    expect(() => value.release(hold.id, ledgerEntryId('release-entry-2'), qty('25'), ReservationReference.from('order-1'), now)).toThrow(InventoryLedgerDomainError);
  });

  test('rejects consumption, reservations, waste, and transfers that exceed available stock', () => {
    const value = ledger();
    value.receive(ledgerEntryId('receive-1'), qty('10'), LedgerReference.from('PO-1'), reason, now);
    expect(() => value.consume(ledgerEntryId('consume-1'), qty('11'), reason, now)).toThrow(InventoryLedgerDomainError);
    expect(() => value.reserve(reservationHoldId('hold-1'), ledgerEntryId('hold-entry-1'), qty('11'), ReservationReference.from('order-1'), now)).toThrow(InventoryLedgerDomainError);
    expect(() => value.waste(ledgerEntryId('waste-1'), qty('11'), reason, now)).toThrow(InventoryLedgerDomainError);
    expect(() => value.transferOut(transferId('transfer-1'), ledgerEntryId('transfer-entry-1'), qty('11'), TransferReference.from('transfer-ref'), storageLocationId('other-store'), now)).toThrow(InventoryLedgerDomainError);
  });

  test('records transfers and corrections as new auditable entries', () => {
    const value = ledger();
    const receipt = ledgerEntryId('receive-1');
    value.receive(receipt, qty('100'), LedgerReference.from('PO-1'), reason, now);
    value.transferOut(transferId('transfer-1'), ledgerEntryId('transfer-entry-1'), qty('20'), TransferReference.from('transfer-1'), storageLocationId('branch-store'), now);
    value.correct(ledgerEntryId('correction-1'), receipt, qty('5'), MovementReason.from('Receiving correction'), false, now);
    expect(new StockCalculator().calculate(value).onHand).toBe('75');
    expect(value.entries[2].correctionOf).toBe(receipt);
    expect(() => value.correct(ledgerEntryId('correction-2'), ledgerEntryId('missing'), qty('1'), reason, true, now)).toThrow(InventoryLedgerDomainError);
    expect(() => value.transferOut(transferId('transfer-2'), ledgerEntryId('transfer-entry-2'), qty('1'), TransferReference.from('same-location'), storageLocationId('main-store'), now)).toThrow(InventoryLedgerDomainError);
  });

  test('validates sequence, immutable snapshots, reasons, quantities, and units', () => {
    const value = ledger();
    value.receive(ledgerEntryId('receive-1'), qty('1.5'), LedgerReference.from('PO-1'), reason, now);
    expect(new LedgerValidator().validate(value)).toBeUndefined();
    const snapshot = new SnapshotCalculator().calculate(value, SnapshotVersion.from(7));
    expect(snapshot).toEqual({ version: SnapshotVersion.from(7), sequence: expect.objectContaining({ value: 1 }), onHand: '1.5', reserved: '0', available: '1.5', unit: 'G' });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => MovementQuantity.from('0', 'G')).toThrow();
    expect(() => MovementQuantity.from('1', 'invalid unit with spaces')).toThrow();
    expect(() => value.receive(ledgerEntryId('wrong-unit'), MovementQuantity.from('1', 'ML'), LedgerReference.from('PO-2'), reason, now)).toThrow(InventoryLedgerDomainError);
    expect(() => AdjustmentReason.from('')).toThrow();
  });
});
