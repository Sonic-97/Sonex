import type { BranchId, TenantId } from './identifiers'; import type { Instant } from './time'; import type { SchemaVersion } from './versions';
export type ProjectionStatus = 'CURRENT' | 'STALE' | 'REBUILDING';
export interface ReadModelMetadata { readonly tenantId: TenantId; readonly branchId?: BranchId; readonly sourceCheckpoint: string; readonly schemaVersion: SchemaVersion; readonly generatedAt: Instant; readonly sourceUpdatedAt: Instant; readonly status: ProjectionStatus; }
