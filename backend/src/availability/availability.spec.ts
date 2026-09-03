import { instant, schemaVersion, tenantId } from '../shared-kernel';
import { inventoryItemId, storageLocationId } from '../inventory-core';
import { inventoryLedgerId, type LedgerStockSnapshot } from '../inventory-ledger';
import { AvailabilitySnapshot, CapacityPolicy, ReservationCapacity } from './availability.aggregates';
import { AvailabilityDomainError } from './availability.errors';
import { AvailabilityCalculator, CapacityFenceEvaluator, ReservationValidator } from './availability.services';
import { availabilitySnapshotId, capacityPolicyAggregateId, reservationCapacityAggregateId } from './availability.types';
import { AllocationPolicy, AvailabilityWindow, CapacityFence, CapacityPolicyId, ReservableQuantity, SafetyBuffer } from './availability.value-objects';

const tenant = tenantId('tenant-1');
const now = instant('2026-07-30T00:00:00.000Z');
const ledger = (overrides: Partial<LedgerStockSnapshot> = {}): LedgerStockSnapshot => Object.freeze({ contractVersion: schemaVersion(1), tenantId: tenant, ledgerId: inventoryLedgerId('ledger-1'), inventoryItemId: inventoryItemId('beans'), storageLocationId: storageLocationId('main-store'), unit: 'G', onHandQuantity: '100', reservationHoldQuantity: '20', ledgerSequence: 8, snapshotVersion: 1, asOf: now, ...overrides });
const policy = (buffer = '10', fence = '5', adjustment = '0') => CapacityPolicy.create(tenant, capacityPolicyAggregateId('policy-1'), CapacityPolicyId.from('standard'), SafetyBuffer.from(buffer, 'G'), CapacityFence.from(fence, 'G'), AllocationPolicy.from('STRICT', adjustment), AvailabilityWindow.from());

describe('Availability Domain', () => {
  test('derives reservable capacity from Ledger facts and policy only', () => {
    const snapshot = new AvailabilityCalculator().calculate(tenant, availabilitySnapshotId('snapshot-1'), ledger(), policy(), now);
    expect(snapshot.breakdown).toEqual({ ledgerSequence: 8, onHandQuantity: '100', reservationHoldQuantity: '20', safetyBuffer: '10', capacityFence: '5', policyAdjustment: '0', reservableQuantity: '65', unit: 'G' });
    expect(snapshot.status.state.value).toBe('AVAILABLE');
    expect(snapshot.ledger.ledgerId).toBe('ledger-1');
    expect(Object.isFrozen(snapshot.ledger)).toBe(true);
  });

  test('validates promise decisions without writing reservation state to Ledger', () => {
    const snapshot = AvailabilitySnapshot.calculate(tenant, availabilitySnapshotId('snapshot-1'), ledger(), policy(), now);
    expect(snapshot.decide(ReservableQuantity.from('65', 'G'), now).canPromise).toBe(true);
    expect(snapshot.decide(ReservableQuantity.from('66', 'G'), now)).toMatchObject({ canPromise: false, reason: { value: 'INSUFFICIENT_CAPACITY' } });
    expect(() => new ReservationValidator().validate(snapshot, ReservableQuantity.from('66', 'G'), now)).toThrow(AvailabilityDomainError);
  });

  test('enforces buffer and fence invariants against exactly one Ledger snapshot', () => {
    expect(() => AvailabilitySnapshot.calculate(tenant, availabilitySnapshotId('snapshot-1'), ledger(), policy('101'), now)).toThrow(AvailabilityDomainError);
    expect(() => AvailabilitySnapshot.calculate(tenant, availabilitySnapshotId('snapshot-1'), ledger(), policy('10', '81'), now)).toThrow(AvailabilityDomainError);
    expect(() => new CapacityFenceEvaluator().validate(CapacityFence.from('81', 'G'), ReservableQuantity.from('80', 'G'))).toThrow(AvailabilityDomainError);
  });

  test('returns an exhausted capacity state without negative reservable capacity', () => {
    const snapshot = AvailabilitySnapshot.calculate(tenant, availabilitySnapshotId('snapshot-1'), ledger(), policy('70', '20'), now);
    expect(snapshot.status.state.value).toBe('EXHAUSTED');
    expect(snapshot.breakdown.reservableQuantity).toBe('0');
  });

  test('honors deterministic availability windows and supports capacity release events', () => {
    const closed = CapacityPolicy.create(tenant, capacityPolicyAggregateId('policy-closed'), CapacityPolicyId.from('closed'), SafetyBuffer.from('0', 'G'), CapacityFence.from('0', 'G'), AllocationPolicy.from('STRICT'), AvailabilityWindow.from(instant('2026-08-01T00:00:00.000Z')));
    const snapshot = AvailabilitySnapshot.calculate(tenant, availabilitySnapshotId('snapshot-closed'), ledger(), closed, now);
    expect(snapshot.status.state.value).toBe('WINDOW_CLOSED');
    const reservation = new ReservationCapacity(tenant, reservationCapacityAggregateId('capacity-1'), snapshot.id, ReservableQuantity.from('1', 'G'), now);
    reservation.release(now);
    expect(reservation.released).toBe(true);
    expect(() => reservation.release(now)).toThrow(AvailabilityDomainError);
  });
});
