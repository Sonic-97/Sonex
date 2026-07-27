import { ContractError } from './errors';
declare const domainIdBrand: unique symbol;
export type DomainId<TName extends string> = string & { readonly [domainIdBrand]: TName };
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export function domainId<TName extends string>(name: TName, value: string): DomainId<TName> {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new ContractError('SHARED_ID_INVALID', `${name} must contain 1-128 safe identifier characters`, { name });
  return value as DomainId<TName>;
}
export type TenantId = DomainId<'TenantId'>; export type BranchId = DomainId<'BranchId'>; export type ActorId = DomainId<'ActorId'>;
export type DeviceId = DomainId<'DeviceId'>; export type WorkstationId = DomainId<'WorkstationId'>; export type ShiftId = DomainId<'ShiftId'>;
export type CommandId = DomainId<'CommandId'>; export type EventId = DomainId<'EventId'>; export type CorrelationId = DomainId<'CorrelationId'>;
export type CausationId = DomainId<'CausationId'>; export type IdempotencyKey = DomainId<'IdempotencyKey'>; export type AggregateId<TName extends string> = DomainId<TName>;
export const tenantId = (v: string): TenantId => domainId('TenantId', v); export const branchId = (v: string): BranchId => domainId('BranchId', v);
export const actorId = (v: string): ActorId => domainId('ActorId', v); export const deviceId = (v: string): DeviceId => domainId('DeviceId', v);
export const workstationId = (v: string): WorkstationId => domainId('WorkstationId', v); export const shiftId = (v: string): ShiftId => domainId('ShiftId', v);
export const commandId = (v: string): CommandId => domainId('CommandId', v); export const eventId = (v: string): EventId => domainId('EventId', v);
export const correlationId = (v: string): CorrelationId => domainId('CorrelationId', v); export const causationId = (v: string): CausationId => domainId('CausationId', v);
export const idempotencyKey = (v: string): IdempotencyKey => domainId('IdempotencyKey', v);
