import type { AggregateRepository } from '../shared-kernel';
import type { InventoryLedger } from './inventory-ledger.aggregates';
import type { InventoryLedgerId } from './inventory-ledger.types';
export interface InventoryLedgerRepository extends AggregateRepository<InventoryLedger, InventoryLedgerId> {}
