import { DomainService, type Instant } from '../shared-kernel';
import type { LedgerStockSnapshot } from '../inventory-ledger';
import { AvailabilitySnapshot, CapacityPolicy } from './availability.aggregates';
import type { PromiseDecision } from './availability.contracts';
import { availabilityInvariant } from './availability.errors';
import type { AvailabilitySnapshotId } from './availability.types';
import type { CapacityFence, ReservableQuantity } from './availability.value-objects';

export class AvailabilityCalculator extends DomainService { calculate(tenantId: LedgerStockSnapshot['tenantId'], snapshotId: AvailabilitySnapshotId, ledger: LedgerStockSnapshot, policy: CapacityPolicy, at: Instant): AvailabilitySnapshot { return AvailabilitySnapshot.calculate(tenantId, snapshotId, ledger, policy, at); } }
export class CapacityPolicyEvaluator extends DomainService { isActive(policy: CapacityPolicy, at: Instant): boolean { return policy.window.includes(at); } }
export class ReservationValidator extends DomainService { validate(snapshot: AvailabilitySnapshot, requested: ReservableQuantity, at: Instant): PromiseDecision { const decision = snapshot.decide(requested, at); if (!decision.canPromise) availabilityInvariant('AVAILABILITY_CAPACITY_EXCEEDED', `Requested quantity cannot be promised: ${decision.reason.value}`); return decision; } }
export class CapacityFenceEvaluator extends DomainService { validate(fence: CapacityFence, availableLedgerQuantity: ReservableQuantity): void { if (fence.unit !== availableLedgerQuantity.unit || fence.decimal().compare(availableLedgerQuantity.decimal()) > 0) availabilityInvariant('AVAILABILITY_CAPACITY_FENCE_EXCEEDS_STOCK', 'Capacity fence cannot exceed available Ledger stock'); } }
