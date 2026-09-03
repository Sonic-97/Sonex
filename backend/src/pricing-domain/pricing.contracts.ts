import { domainId, type AggregateRepository, type Command, type Query, type RepositoryContext } from '../shared-kernel';
import type { ProductId } from '../catalog-domain';
import type { DiscountPolicy, PriceBook, Promotion, ServiceChargePolicy, TaxPolicy } from './pricing.types';
import type { DiscountRate, PromotionWindow, TaxRate } from './pricing.value-objects';
import type { CurrencyPolicyId, DiscountPolicyId, PriceBookId, PriceRuleId, PromotionId, ServiceChargePolicyId, TaxPolicyId } from './pricing.types';

export const priceBookId = (value: string): PriceBookId => domainId('PriceBookId', value);
export const priceRuleId = (value: string): PriceRuleId => domainId('PriceRuleId', value);
export const promotionId = (value: string): PromotionId => domainId('PromotionId', value);
export const discountPolicyId = (value: string): DiscountPolicyId => domainId('DiscountPolicyId', value);
export const taxPolicyId = (value: string): TaxPolicyId => domainId('TaxPolicyId', value);
export const serviceChargePolicyId = (value: string): ServiceChargePolicyId => domainId('ServiceChargePolicyId', value);
export type CreatePriceBook = Command<'PRICING_CREATE_PRICE_BOOK', { readonly priceBookId: PriceBookId; readonly currency: string }>;
export type PublishPriceBook = Command<'PRICING_PUBLISH_PRICE_BOOK', { readonly priceBookId: PriceBookId }>;
export type ArchivePriceBook = Command<'PRICING_ARCHIVE_PRICE_BOOK', { readonly priceBookId: PriceBookId }>;
export type CreatePromotion = Command<'PRICING_CREATE_PROMOTION', { readonly promotionId: PromotionId; readonly discountPolicyId: DiscountPolicyId; readonly window: PromotionWindow }>;
export type ActivatePromotion = Command<'PRICING_ACTIVATE_PROMOTION', { readonly promotionId: PromotionId }>;
export type DeactivatePromotion = Command<'PRICING_DEACTIVATE_PROMOTION', { readonly promotionId: PromotionId }>;
export type CreateTaxPolicy = Command<'PRICING_CREATE_TAX_POLICY', { readonly taxPolicyId: TaxPolicyId; readonly rate: TaxRate }>;
export type CreateDiscountPolicy = Command<'PRICING_CREATE_DISCOUNT_POLICY', { readonly discountPolicyId: DiscountPolicyId; readonly rate: DiscountRate }>;
export type ResolvePriceQuery = Query<'PRICING_RESOLVE_PRICE', { readonly productId: ProductId }>;
export type EffectivePricesQuery = Query<'PRICING_EFFECTIVE_PRICES', { readonly productId: ProductId }>;
export type PromotionsQuery = Query<'PRICING_PROMOTIONS', {}>; export type TaxesQuery = Query<'PRICING_TAXES', {}>; export type DiscountsQuery = Query<'PRICING_DISCOUNTS', {}>; export type PricingHistoryQuery = Query<'PRICING_HISTORY', { readonly productId: ProductId }>;
export interface PriceBookRepository extends AggregateRepository<PriceBook, PriceBookId> { findPublished(context: RepositoryContext): Promise<PriceBook | undefined>; }
export interface PromotionRepository extends AggregateRepository<Promotion, PromotionId> {}
export interface DiscountPolicyRepository extends AggregateRepository<DiscountPolicy, DiscountPolicyId> {}
export interface TaxPolicyRepository extends AggregateRepository<TaxPolicy, TaxPolicyId> {}
export interface ServiceChargePolicyRepository extends AggregateRepository<ServiceChargePolicy, ServiceChargePolicyId> {}
