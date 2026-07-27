import type { ActorId, BranchId, DeviceId, ShiftId, TenantId, WorkstationId, DomainId } from './identifiers';
export type ActorType = 'SYSTEM' | 'CUSTOMER' | 'STAFF' | 'INTEGRATION';
export type Channel = 'POS' | 'WAITER' | 'TELEGRAM' | 'QR' | 'DESKTOP' | 'SYSTEM';
export interface ActorContext { readonly actorId: ActorId; readonly actorType: ActorType; readonly role?: string; }
export interface ApprovalReference { readonly approvalId: DomainId<'ApprovalId'>; readonly approvedBy: ActorId; readonly reasonCode: string; }
export interface OperationalContext {
  readonly tenantId: TenantId; readonly branchId?: BranchId; readonly actor: ActorContext; readonly deviceId?: DeviceId;
  readonly workstationId?: WorkstationId; readonly shiftId?: ShiftId; readonly channel: Channel; readonly reasonCode?: string; readonly approval?: ApprovalReference;
}
