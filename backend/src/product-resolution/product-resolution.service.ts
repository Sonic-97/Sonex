import { Clock, deepFreeze, SchemaVersion, schemaVersion, SystemClock } from '../shared-kernel';
import { CatalogModifierGroup, CatalogProduct, ModifierSelection, ProductResolutionInput, ProductResolutionResult, ResolvedModifierGroup, ResolvedVariant, SellingWindow } from './domain/product-resolution.types';
import { AvailabilityConfigurationError, DuplicateModifierChoiceError, DuplicateModifierGroupError, InactiveModifierError, ModifierChoiceUnknownError, ModifierGroupUnknownError, ProductDeletedError, ProductDisabledError, ProductHiddenError, ProductNotFoundError, ProductOutsideSellingWindowError, ProductQuantityError, RequiredModifierMissingError, TenantScopeViolationError, TooManyModifiersError, VariantUnavailableError } from './domain/product-resolution.errors';

const CONTRACT_VERSION: SchemaVersion = schemaVersion(1);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Preserve branded primitive types while retaining the Shared Kernel's runtime deep freeze.
function freezeContract<T>(value: T): T {
  return deepFreeze(value) as T;
}

/** Pure domain service. A future repository adapter supplies catalog snapshots. */
export class ProductResolutionService {
  constructor(private readonly clock: Clock = new SystemClock()) {}

  resolve(input: ProductResolutionInput, product: CatalogProduct | null): ProductResolutionResult {
    if (!product) throw new ProductNotFoundError(input.reference.value);
    if (input.tenantId !== product.tenantId || input.cafeId !== product.cafeId) throw new TenantScopeViolationError();
    const matches = input.reference.kind === 'PRODUCT_ID' ? input.reference.value === product.id : input.reference.kind === 'SLUG' ? input.reference.value === product.slug : input.reference.value === product.barcode;
    if (!matches) throw new ProductNotFoundError(input.reference.value);
    if (!product.active) throw new ProductDisabledError();
    if (product.deleted) throw new ProductDeletedError();
    if (product.hidden) throw new ProductHiddenError();
    this.validateQuantity(input);
    this.validateSellingWindow(input, product.sellingWindow);
    const resolvedAt = this.clock.now();
    return freezeContract<ProductResolutionResult>({
      contractVersion: CONTRACT_VERSION, productId: product.id, cafeId: product.cafeId, tenantId: product.tenantId, reference: input.reference,
      productName: product.name, sku: product.sku, quantity: input.quantity, variant: this.resolveVariant(input, product), modifiers: this.resolveModifiers(input.modifiers, product.modifierGroups),
      basePrice: product.basePrice, availability: { sellable: product.branchAvailable !== false, evaluatedAt: resolvedAt, reasons: [...(product.branchAvailable === false ? ['BRANCH_UNAVAILABLE' as const] : []), 'PRODUCT_ACTIVE', 'VISIBLE', 'WITHIN_SELLING_WINDOW'], ...(product.sellingWindow ? { sellingWindow: product.sellingWindow } : {}), inventoryStatus: 'NOT_EVALUATED' },
      recipeReference: product.recipeReference, taxCategory: product.taxCategory, metadata: product.metadata, resolvedAt,
    });
  }

  private validateQuantity(input: ProductResolutionInput): void {
    if (input.quantity.unit !== 'each') throw new ProductQuantityError('Product quantity must use the each unit');
    if (!/^[1-9]\d*$/.test(input.quantity.serialize().value)) throw new ProductQuantityError('Product quantity must be a positive whole number');
  }

  private resolveVariant(input: ProductResolutionInput, product: CatalogProduct): ResolvedVariant | null {
    if (!input.variant) return null;
    const variant = product.variants.find((candidate) => candidate.active && (!input.variant?.variantId || candidate.id === input.variant.variantId) && (!input.variant?.name || candidate.name === input.variant.name));
    if (!variant) throw new VariantUnavailableError();
    return freezeContract<ResolvedVariant>({ id: variant.id, name: variant.name, priceAdjustment: variant.priceAdjustment });
  }

  private resolveModifiers(selections: readonly ModifierSelection[], groups: readonly CatalogModifierGroup[]): readonly ResolvedModifierGroup[] {
    const selected = new Map<string, ModifierSelection>();
    for (const selection of selections) { if (selected.has(selection.groupId)) throw new DuplicateModifierGroupError(); selected.set(selection.groupId, selection); }
    for (const groupId of selected.keys()) if (!groups.some((group) => group.id === groupId)) throw new ModifierGroupUnknownError();
    return groups.map((group) => this.resolveGroup(group, selected.get(group.id))).filter((group): group is ResolvedModifierGroup => group !== null);
  }

  private resolveGroup(group: CatalogModifierGroup, selection?: ModifierSelection): ResolvedModifierGroup | null {
    const ids = selection?.choiceIds ?? [];
    if (group.required && ids.length === 0) throw new RequiredModifierMissingError();
    if (ids.length === 0) return null;
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) throw new DuplicateModifierChoiceError();
      seen.add(id);
    }
    if ((!group.multiSelect && ids.length > 1) || (group.maximumSelections !== undefined && ids.length > group.maximumSelections)) throw new TooManyModifiersError();
    const selectedChoices = ids.map((id) => {
      const choice = group.choices.find((candidate) => candidate.id === id);
      if (!choice) throw new ModifierChoiceUnknownError(); if (!choice.active) throw new InactiveModifierError();
      return freezeContract({ id: choice.id, name: choice.name, priceAdjustment: choice.priceAdjustment });
    });
    return freezeContract<ResolvedModifierGroup>({ id: group.id, name: group.name, required: group.required, multiSelect: group.multiSelect, selectedChoices });
  }

  private validateSellingWindow(input: ProductResolutionInput, window?: SellingWindow): void {
    if (!window) return;
    if ((window.startTime && !TIME_PATTERN.test(window.startTime)) || (window.endTime && !TIME_PATTERN.test(window.endTime)) || (window.days && window.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) || (window.startTime && window.endTime && window.startTime >= window.endTime)) throw new AvailabilityConfigurationError();
    let parts: Intl.DateTimeFormatPart[];
    try { parts = new Intl.DateTimeFormat('en-US', { timeZone: input.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(input.requestedAt)); } catch { throw new AvailabilityConfigurationError(); }
    const part = (type: string) => parts.find((value) => value.type === type)?.value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday') ?? '');
    const current = `${part('hour')}:${part('minute')}`;
    if (day < 0 || current.includes('undefined')) throw new AvailabilityConfigurationError();
    if ((window.days && !window.days.includes(day)) || (window.startTime && current < window.startTime) || (window.endTime && current >= window.endTime)) throw new ProductOutsideSellingWindowError();
  }
}
