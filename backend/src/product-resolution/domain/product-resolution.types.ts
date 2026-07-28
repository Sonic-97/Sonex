import { AggregateId, DeepReadonly, Instant, JsonValue, Quantity, SchemaVersion, TenantId } from '../../shared-kernel';

export type CafeId = AggregateId<'CafeId'>;
export type ProductId = AggregateId<'ProductId'>;
export type VariantId = AggregateId<'VariantId'>;
export type ModifierGroupId = AggregateId<'ModifierGroupId'>;
export type ModifierChoiceId = AggregateId<'ModifierChoiceId'>;
export type ProductReference = Readonly<{ kind: 'PRODUCT_ID'; value: ProductId }> | Readonly<{ kind: 'SLUG'; value: string }> | Readonly<{ kind: 'BARCODE'; value: string }>;
export interface VariantSelection { readonly variantId?: VariantId; readonly name?: string; }
export interface ModifierSelection { readonly groupId: ModifierGroupId; readonly choiceIds: readonly ModifierChoiceId[]; }
export interface SellingWindow { readonly startTime?: string; readonly endTime?: string; readonly days?: readonly number[]; }
export type AvailabilityReason = 'PRODUCT_ACTIVE' | 'VISIBLE' | 'WITHIN_SELLING_WINDOW' | 'BRANCH_UNAVAILABLE';
export interface AvailabilityResult { readonly sellable: boolean; readonly evaluatedAt: Instant; readonly reasons: readonly AvailabilityReason[]; readonly sellingWindow?: SellingWindow; readonly inventoryStatus: 'NOT_EVALUATED'; }
export interface CatalogVariant { readonly id: VariantId; readonly name: string; readonly priceAdjustment: string; readonly active: boolean; }
export interface CatalogModifierChoice { readonly id: ModifierChoiceId; readonly name: string; readonly priceAdjustment: string; readonly active: boolean; }
export interface CatalogModifierGroup { readonly id: ModifierGroupId; readonly name: string; readonly required: boolean; readonly multiSelect: boolean; readonly maximumSelections?: number; readonly choices: readonly CatalogModifierChoice[]; }
export interface CatalogProduct {
  readonly id: ProductId; readonly tenantId: TenantId; readonly cafeId: CafeId; readonly name: string; readonly sku: string; readonly slug?: string; readonly barcode?: string; readonly basePrice: string;
  readonly active: boolean; readonly deleted: boolean; readonly hidden: boolean; readonly branchAvailable?: boolean; readonly variants: readonly CatalogVariant[]; readonly modifierGroups: readonly CatalogModifierGroup[]; readonly sellingWindow?: SellingWindow;
  readonly recipeReference: string | null; readonly taxCategory: string; readonly metadata: DeepReadonly<Record<string, JsonValue>>;
}
export interface ProductResolutionInput { readonly tenantId: TenantId; readonly cafeId: CafeId; readonly reference: ProductReference; readonly variant?: VariantSelection; readonly modifiers: readonly ModifierSelection[]; readonly quantity: Quantity; readonly requestedAt: Instant; readonly timezone: string; }
export interface ResolvedVariant { readonly id: VariantId; readonly name: string; readonly priceAdjustment: string; }
export interface ResolvedModifierChoice { readonly id: ModifierChoiceId; readonly name: string; readonly priceAdjustment: string; }
export interface ResolvedModifierGroup { readonly id: ModifierGroupId; readonly name: string; readonly required: boolean; readonly multiSelect: boolean; readonly selectedChoices: readonly ResolvedModifierChoice[]; }
export interface ProductResolutionResult {
  readonly contractVersion?: SchemaVersion; readonly productId: ProductId; readonly cafeId: CafeId; readonly tenantId: TenantId; readonly reference: ProductReference; readonly productName: string; readonly sku: string;
  readonly quantity: Quantity; readonly variant: ResolvedVariant | null; readonly modifiers: readonly ResolvedModifierGroup[]; readonly basePrice: string; readonly availability: AvailabilityResult;
  readonly recipeReference: string | null; readonly taxCategory: string; readonly metadata: DeepReadonly<Record<string, JsonValue>>; readonly resolvedAt: Instant;
}
