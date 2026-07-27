import { ContractError } from './errors'; declare const versionBrand: unique symbol;
type Version<T extends string> = number & { readonly [versionBrand]: T }; export type AggregateVersion = Version<'AggregateVersion'>; export type ExpectedVersion = Version<'ExpectedVersion'>; export type EventSequence = Version<'EventSequence'>; export type SchemaVersion = Version<'SchemaVersion'>;
function checked<T extends string>(name: T, value: number, minimum: number): Version<T> { if (!Number.isSafeInteger(value) || value < minimum) throw new ContractError('SHARED_VERSION_INVALID', `${name} must be a safe integer >= ${minimum}`, { name, value }); return value as Version<T>; }
export const aggregateVersion = (v: number): AggregateVersion => checked('AggregateVersion', v, 0); export const expectedVersion = (v: number): ExpectedVersion => checked('ExpectedVersion', v, 0);
export const eventSequence = (v: number): EventSequence => checked('EventSequence', v, 1); export const schemaVersion = (v: number): SchemaVersion => checked('SchemaVersion', v, 1);
export const nextAggregateVersion = (v: AggregateVersion): AggregateVersion => aggregateVersion(v + 1);
