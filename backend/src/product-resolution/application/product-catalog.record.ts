import { BranchId, TenantId } from '../../shared-kernel';

export interface ProductCatalogScope {
  readonly tenantId: TenantId;
  readonly cafeId: string;
  readonly branchId?: BranchId;
}

export interface ProductCatalogSizeRecord {
  readonly id: string;
  readonly name: string;
  readonly priceAdjustment: string;
  readonly active: boolean;
}

export interface ProductCatalogOptionRecord {
  readonly id: string;
  readonly name: string;
  readonly required: boolean;
  readonly multiSelect: boolean;
  readonly choices: unknown;
}

export interface ProductCatalogBranchOverride {
  readonly price: string;
  readonly isAvailable: boolean;
}

export interface ProductCatalogRecord {
  readonly id: string;
  readonly cafeId: string;
  readonly branchId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly price: string;
  readonly active: boolean;
  readonly attributes: unknown;
  readonly tags: unknown;
  readonly images: unknown;
  readonly availability: unknown;
  readonly sizes: readonly ProductCatalogSizeRecord[];
  readonly options: readonly ProductCatalogOptionRecord[];
  readonly branchOverride?: ProductCatalogBranchOverride;
}
