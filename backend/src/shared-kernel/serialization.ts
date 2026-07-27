import { ContractError } from './errors'; import { deepFreeze, JsonValue } from './immutable'; import type { DeepReadonly } from './immutable'; import type { SchemaVersion } from './versions';
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}
function checksum(value: string): string {
  let hash = 0xcbf29ce484222325n; for (const character of value) { hash ^= BigInt(character.codePointAt(0) as number); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return `fnv1a64-v1:${hash.toString(16).padStart(16, '0')}`;
}
export interface SnapshotEnvelope<T extends JsonValue> { readonly schemaVersion: SchemaVersion; readonly snapshotType: string; readonly payload: DeepReadonly<T>; readonly checksum: string; }
export function createSnapshot<T extends JsonValue>(snapshotType: string, schema: SchemaVersion, payload: T): SnapshotEnvelope<T> {
  if (!snapshotType) throw new ContractError('SHARED_SNAPSHOT_TYPE_INVALID', 'Snapshot type is required');
  const frozen = deepFreeze(payload); const digest = checksum(canonicalJson(frozen as JsonValue)); return Object.freeze({ schemaVersion: schema, snapshotType, payload: frozen, checksum: digest });
}
export function validateSnapshot<T extends JsonValue>(snapshot: SnapshotEnvelope<T>): void {
  if (snapshot.checksum !== checksum(canonicalJson(snapshot.payload as JsonValue))) throw new ContractError('SHARED_SNAPSHOT_INTEGRITY_FAILED', 'Snapshot checksum does not match its payload');
}
