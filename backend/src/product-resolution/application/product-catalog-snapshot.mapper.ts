import { Injectable } from '@nestjs/common';
import { deepFreeze, domainId, JsonValue } from '../../shared-kernel';
import { ProductCatalogValidationError } from './product-catalog.errors';
import { ProductCatalogRecord, ProductCatalogScope } from './product-catalog.record';
import { CafeId, CatalogModifierChoice, CatalogModifierGroup, CatalogProduct, CatalogVariant, ModifierChoiceId, ModifierGroupId, ProductId, SellingWindow, VariantId } from '../domain/product-resolution.types';

type JsonRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function freezeContract<T>(value: T): T {
  deepFreeze(value);
  return value;
}

@Injectable()
export class ProductCatalogSnapshotMapper {
  toSnapshot(record: ProductCatalogRecord, scope: ProductCatalogScope): CatalogProduct {
    if (record.cafeId !== scope.cafeId) {
      throw new ProductCatalogValidationError('Catalog record cafe does not match the requested scope');
    }
    const metadata = freezeContract({
      attributes: this.toJsonValue(record.attributes, 'attributes'),
      tags: this.toJsonValue(record.tags, 'tags'),
      images: this.toJsonValue(record.images, 'images'),
      availability: this.toJsonValue(record.availability, 'availability'),
    });
    const cafeId: CafeId = domainId('CafeId', record.cafeId);
    const productId: ProductId = domainId('ProductId', record.id);
    const sellingWindow = this.toSellingWindow(record.availability);
    return freezeContract<CatalogProduct>({
      id: productId,
      tenantId: scope.tenantId,
      cafeId,
      name: record.name,
      sku: record.code ?? record.id,
      basePrice: record.branchOverride?.price ?? record.price,
      active: record.active,
      deleted: false,
      hidden: false,
      branchAvailable: record.branchOverride?.isAvailable ?? true,
      variants: record.sizes.map((size) => this.toVariant(size.id, size.name, size.priceAdjustment, size.active)),
      modifierGroups: record.options.map((option) => this.toModifierGroup(option.id, option.name, option.required, option.multiSelect, option.choices)),
      ...(sellingWindow ? { sellingWindow } : {}),
      recipeReference: null,
      taxCategory: 'DEFAULT',
      metadata,
    });
  }

  private toVariant(id: string, name: string, priceAdjustment: string, active: boolean): CatalogVariant {
    const variantId: VariantId = domainId('VariantId', id);
    return freezeContract<CatalogVariant>({ id: variantId, name, priceAdjustment, active });
  }

  private toModifierGroup(id: string, name: string, required: boolean, multiSelect: boolean, choices: unknown): CatalogModifierGroup {
    const groupId: ModifierGroupId = domainId('ModifierGroupId', id);
    return freezeContract<CatalogModifierGroup>({
      id: groupId,
      name,
      required,
      multiSelect,
      choices: this.toChoices(choices),
    });
  }

  private toChoices(value: unknown): readonly CatalogModifierChoice[] {
    if (!Array.isArray(value)) throw new ProductCatalogValidationError('Product option choices must be an array');
    return value.map((choice, index) => {
      if (!isRecord(choice)) throw new ProductCatalogValidationError('Product option choice must be an object', { index });
      const persistedId = choice.id;
      if (typeof persistedId !== 'string' || persistedId.trim().length === 0) {
        throw new ProductCatalogValidationError('Product option choice is missing an immutable identifier', { index });
      }
      const label = typeof choice.label === 'string' ? choice.label : choice.name;
      if (typeof label !== 'string' || label.trim().length === 0) {
        throw new ProductCatalogValidationError('Product option choice is missing a display name', { index, choiceId: persistedId });
      }
      const active = choice.active === undefined ? true : choice.active;
      if (typeof active !== 'boolean') throw new ProductCatalogValidationError('Product option choice has an invalid active flag', { choiceId: persistedId });
      const choiceId: ModifierChoiceId = domainId('ModifierChoiceId', persistedId);
      return freezeContract<CatalogModifierChoice>({
        id: choiceId,
        name: label,
        priceAdjustment: this.decimalString(choice.priceAdjust, 'priceAdjust'),
        active,
      });
    });
  }

  private toSellingWindow(value: unknown): SellingWindow | undefined {
    if (!isRecord(value)) return undefined;
    const source = isRecord(value.sellingWindow) ? value.sellingWindow : value;
    const startTimeValue = source.startTime;
    const endTimeValue = source.endTime;
    const daysValue = source.days;
    if (startTimeValue === undefined && endTimeValue === undefined && daysValue === undefined) return undefined;
    if ((startTimeValue !== undefined && typeof startTimeValue !== 'string') || (endTimeValue !== undefined && typeof endTimeValue !== 'string')) {
      throw new ProductCatalogValidationError('Selling window time values must be strings');
    }
    if (daysValue !== undefined && (!Array.isArray(daysValue) || daysValue.some((day) => typeof day !== 'number'))) {
      throw new ProductCatalogValidationError('Selling window days must be numeric');
    }
    const startTime = typeof startTimeValue === 'string' ? startTimeValue : undefined;
    const endTime = typeof endTimeValue === 'string' ? endTimeValue : undefined;
    const days = Array.isArray(daysValue) ? daysValue.filter((day): day is number => typeof day === 'number') : undefined;
    return freezeContract<SellingWindow>({ ...(startTime ? { startTime } : {}), ...(endTime ? { endTime } : {}), ...(days ? { days } : {}) });
  }

  private decimalString(value: unknown, field: string): string {
    if (value === undefined) return '0';
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
    throw new ProductCatalogValidationError('Catalog decimal value is invalid', { field });
  }

  private toJsonValue(value: unknown, field: string): JsonValue {
    if (value === null) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map((item) => this.toJsonValue(item, field));
    if (isRecord(value)) {
      const result: Record<string, JsonValue> = {};
      for (const [key, nested] of Object.entries(value)) result[key] = this.toJsonValue(nested, field);
      return result;
    }
    throw new ProductCatalogValidationError('Catalog JSON value is invalid', { field });
  }
}
