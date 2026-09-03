import { DomainService } from '../shared-kernel';
import { InventoryLedger, LedgerEntry } from './inventory-ledger.aggregates';
import { ledgerInvariant } from './inventory-ledger.errors';
import { SnapshotVersion } from './inventory-ledger.value-objects';

export class StockCalculator extends DomainService { calculate(ledger: InventoryLedger): Readonly<{ readonly onHand: string; readonly reserved: string; readonly available: string; readonly unit: string }> { const snapshot = ledger.snapshot(SnapshotVersion.from(0)); return Object.freeze({ onHand: snapshot.onHand, reserved: snapshot.reserved, available: snapshot.available, unit: snapshot.unit }); } }
export class LedgerValidator extends DomainService { validate(ledger: InventoryLedger): void { const ids = new Set(ledger.entries.map((entry) => entry.id)); if (ids.size !== ledger.entries.length) ledgerInvariant('LEDGER_ENTRY_DUPLICATE', 'Ledger entries must be unique'); for (let index = 0; index < ledger.entries.length; index += 1) if (ledger.entries[index].sequence.value !== index + 1) ledgerInvariant('LEDGER_SEQUENCE_INVALID', 'Ledger sequence must be contiguous'); } }
export class MovementConsistencyValidator extends DomainService { validate(entry: LedgerEntry, ledger: InventoryLedger): void { if (entry.quantity.unit !== ledger.unit) ledgerInvariant('LEDGER_MOVEMENT_UNIT_MISMATCH', 'Movement unit must match ledger unit'); } }
export class SnapshotCalculator extends DomainService { calculate(ledger: InventoryLedger, version: SnapshotVersion): ReturnType<InventoryLedger['snapshot']> { return ledger.snapshot(version); } }
