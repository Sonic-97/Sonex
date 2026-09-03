import { domainId, type AggregateId, type TenantId } from '../shared-kernel';

export type CatalogId = AggregateId<'CatalogId'>;
export type ProductId = AggregateId<'CatalogProductId'>;
export type ProductVariantId = AggregateId<'CatalogProductVariantId'>;
export type CategoryId = AggregateId<'CatalogCategoryId'>;
export type ModifierGroupId = AggregateId<'CatalogModifierGroupId'>;
export type ModifierId = AggregateId<'CatalogModifierId'>;
export type TagId = AggregateId<'CatalogTagId'>;

export const catalogId = (value: string): CatalogId => domainId('CatalogId', value);
export const productId = (value: string): ProductId => domainId('CatalogProductId', value);
export const productVariantId = (value: string): ProductVariantId => domainId('CatalogProductVariantId', value);
export const categoryId = (value: string): CategoryId => domainId('CatalogCategoryId', value);
export const modifierGroupId = (value: string): ModifierGroupId => domainId('CatalogModifierGroupId', value);
export const modifierId = (value: string): ModifierId => domainId('CatalogModifierId', value);
export const tagId = (value: string): TagId => domainId('CatalogTagId', value);

export interface CatalogScope { readonly catalogId: CatalogId; readonly tenantId: TenantId; }
