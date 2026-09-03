import { AggregateRoot, Entity, type Instant, type TenantId } from '../shared-kernel';
import { catalogInvariant } from './catalog.errors';
import type { CatalogDomainEvent, CatalogEventName } from './catalog.contracts';
import type { CategoryId, CatalogId, ModifierGroupId, ModifierId, ProductId, ProductVariantId, TagId } from './catalog.types';
import { CategoryPath, DisplayOrder, MediaReference, ProductDescription, ProductName, type Barcode, ProductStatus, type SKU, type Slug, TagName, Visibility } from './catalog.value-objects';

const event = (name: CatalogEventName, catalogId: CatalogId, tenantId: TenantId, aggregateId: string, occurredAt: Instant): CatalogDomainEvent => ({ name, payload: { catalogId: String(catalogId), tenantId: String(tenantId), aggregateId, occurredAt: String(occurredAt) } });

export class Catalog extends AggregateRoot<CatalogId, CatalogDomainEvent> {
  private constructor(id: CatalogId, public readonly tenantId: TenantId) { super(id); }
  static create(id: CatalogId, tenantId: TenantId): Catalog { return new Catalog(id, tenantId); }
}

export interface CreateCatalogProductInput { readonly id: ProductId; readonly catalogId: CatalogId; readonly tenantId: TenantId; readonly name: ProductName; readonly sku: SKU; readonly description?: ProductDescription; readonly slug?: Slug; readonly barcode?: Barcode; readonly occurredAt: Instant; }
export class ProductVariant extends Entity<ProductVariantId> {
  constructor(id: ProductVariantId, public readonly name: ProductName, public readonly displayOrder: DisplayOrder, public readonly active = true) { super(id); Object.freeze(this); }
}

export class Product extends AggregateRoot<ProductId, CatalogDomainEvent> {
  private variantItems: ProductVariant[] = [];
  private mediaItems: MediaReference[] = [];
  private tagItems: TagId[] = [];
  private modifierGroupItems: ModifierGroupId[] = [];
  private relatedProductItems: ProductId[] = [];
  private categoryValue?: CategoryId;
  private descriptionValue?: ProductDescription;
  private statusValue: ProductStatus = ProductStatus.draft();
  private visibilityValue: Visibility = Visibility.visible();
  private availableValue = true;

  private constructor(private readonly catalog: CatalogId, private readonly tenant: TenantId, id: ProductId, private nameValue: ProductName, private skuValue: SKU, private slugValue?: Slug, private barcodeValue?: Barcode, description?: ProductDescription) {
    super(id); this.descriptionValue = description;
  }

  static create(input: CreateCatalogProductInput): Product {
    const product = new Product(input.catalogId, input.tenantId, input.id, input.name, input.sku, input.slug, input.barcode, input.description);
    product.record(event('ProductCreated', input.catalogId, input.tenantId, input.id, input.occurredAt));
    return product;
  }

  get catalogId(): CatalogId { return this.catalog; } get tenantId(): TenantId { return this.tenant; } get name(): ProductName { return this.nameValue; } get sku(): SKU { return this.skuValue; } get slug(): Slug | undefined { return this.slugValue; } get barcode(): Barcode | undefined { return this.barcodeValue; } get description(): ProductDescription | undefined { return this.descriptionValue; } get status(): ProductStatus { return this.statusValue; } get visibility(): Visibility { return this.visibilityValue; } get isAvailable(): boolean { return this.availableValue; } get categoryId(): CategoryId | undefined { return this.categoryValue; }
  get variants(): readonly ProductVariant[] { return Object.freeze([...this.variantItems]); } get media(): readonly MediaReference[] { return Object.freeze([...this.mediaItems]); } get tags(): readonly TagId[] { return Object.freeze([...this.tagItems]); } get modifierGroupIds(): readonly ModifierGroupId[] { return Object.freeze([...this.modifierGroupItems]); } get relatedProductIds(): readonly ProductId[] { return Object.freeze([...this.relatedProductItems]); }

  rename(name: ProductName, occurredAt: Instant): void { this.assertMutable(); this.nameValue = name; this.changed('ProductUpdated', occurredAt); }
  updateDescription(description: ProductDescription | undefined, occurredAt: Instant): void { this.assertMutable(); this.descriptionValue = description; this.changed('ProductUpdated', occurredAt); }
  assignCategory(categoryId: CategoryId | undefined, occurredAt: Instant): void { this.assertMutable(); this.categoryValue = categoryId; this.changed('ProductUpdated', occurredAt); }
  attachModifierGroup(groupId: ModifierGroupId, occurredAt: Instant): void { this.assertMutable(); if (this.modifierGroupItems.includes(groupId)) catalogInvariant('CATALOG_MODIFIER_GROUP_DUPLICATE', 'Modifier group is already attached'); this.modifierGroupItems.push(groupId); this.changed('ModifierAttached', occurredAt); }
  detachModifierGroup(groupId: ModifierGroupId, occurredAt: Instant): void { this.assertMutable(); if (!this.modifierGroupItems.includes(groupId)) catalogInvariant('CATALOG_MODIFIER_GROUP_MISSING', 'Modifier group is not attached'); this.modifierGroupItems = this.modifierGroupItems.filter((id) => id !== groupId); this.changed('ModifierDetached', occurredAt); }
  attachTag(tagId: TagId, occurredAt: Instant): void { this.assertMutable(); if (this.tagItems.includes(tagId)) catalogInvariant('CATALOG_TAG_DUPLICATE', 'Tag is already attached'); this.tagItems.push(tagId); this.changed('ProductUpdated', occurredAt); }
  relateTo(productId: ProductId, occurredAt: Instant): void { this.assertMutable(); if (productId === this.id) catalogInvariant('CATALOG_PRODUCT_RELATION_SELF', 'Product cannot be related to itself'); if (this.relatedProductItems.includes(productId)) catalogInvariant('CATALOG_PRODUCT_RELATION_DUPLICATE', 'Product relationship already exists'); this.relatedProductItems.push(productId); this.changed('ProductUpdated', occurredAt); }
  addMedia(media: MediaReference, occurredAt: Instant): void { this.assertMutable(); if (this.mediaItems.some((item) => item.uri === media.uri)) catalogInvariant('CATALOG_MEDIA_DUPLICATE', 'Media URI is already attached'); this.mediaItems.push(media); this.changed('ProductUpdated', occurredAt); }
  addVariant(variant: ProductVariant, occurredAt: Instant): void { this.assertMutable(); if (this.variantItems.some((item) => item.id === variant.id)) catalogInvariant('CATALOG_VARIANT_DUPLICATE', 'Variant is already attached'); this.variantItems.push(variant); this.changed('ProductUpdated', occurredAt); }
  setAvailable(available: boolean, occurredAt: Instant): void { this.assertMutable(); if (this.availableValue === available) return; this.availableValue = available; this.changed('ProductUpdated', occurredAt); }
  publish(occurredAt: Instant): void { if (this.statusValue.value === 'ARCHIVED') catalogInvariant('CATALOG_PRODUCT_ARCHIVED', 'Archived products cannot be published'); if (this.statusValue.value === 'PUBLISHED') catalogInvariant('CATALOG_PRODUCT_ALREADY_PUBLISHED', 'Product is already published'); this.statusValue = ProductStatus.published(); this.incrementVersion(); this.record(event('ProductPublished', this.catalog, this.tenant, this.id, occurredAt)); }
  archive(occurredAt: Instant): void { if (this.statusValue.value === 'ARCHIVED') catalogInvariant('CATALOG_PRODUCT_ALREADY_ARCHIVED', 'Product is already archived'); this.statusValue = ProductStatus.archived(); this.incrementVersion(); this.record(event('ProductArchived', this.catalog, this.tenant, this.id, occurredAt)); }
  changeVisibility(visibility: Visibility, occurredAt: Instant): void { if (this.statusValue.value === 'ARCHIVED') catalogInvariant('CATALOG_PRODUCT_ARCHIVED', 'Archived products cannot change visibility'); if (this.visibilityValue.equals(visibility)) return; this.visibilityValue = visibility; this.incrementVersion(); this.record(event('VisibilityChanged', this.catalog, this.tenant, this.id, occurredAt)); }
  changeIdentifiers(sku: SKU, slug: Slug | undefined, barcode: Barcode | undefined, occurredAt: Instant): void { if (this.statusValue.value === 'PUBLISHED') catalogInvariant('CATALOG_PUBLISHED_IDENTIFIER_IMMUTABLE', 'Published product identifiers are immutable'); this.assertMutable(); this.skuValue = sku; this.slugValue = slug; this.barcodeValue = barcode; this.changed('ProductUpdated', occurredAt); }
  private assertMutable(): void { if (this.statusValue.value === 'ARCHIVED') catalogInvariant('CATALOG_PRODUCT_ARCHIVED', 'Archived product cannot be modified'); }
  private changed(name: Extract<CatalogEventName, 'ProductUpdated' | 'ModifierAttached' | 'ModifierDetached'>, occurredAt: Instant): void { this.incrementVersion(); this.record(event(name, this.catalog, this.tenant, this.id, occurredAt)); }
}

export interface CreateCategoryInput { readonly id: CategoryId; readonly catalogId: CatalogId; readonly tenantId: TenantId; readonly name: ProductName; readonly path: CategoryPath; readonly parentId?: CategoryId; readonly occurredAt: Instant; }
export class Category extends AggregateRoot<CategoryId, CatalogDomainEvent> {
  private constructor(private readonly catalog: CatalogId, private readonly tenant: TenantId, id: CategoryId, private nameValue: ProductName, private parentValue: CategoryId | undefined, private pathValue: CategoryPath) { super(id); }
  static create(input: CreateCategoryInput): Category { if (!input.path.contains(input.id)) catalogInvariant('CATALOG_CATEGORY_PATH_INVALID', 'Category path must contain the category itself'); const category = new Category(input.catalogId, input.tenantId, input.id, input.name, input.parentId, input.path); category.record(event('CategoryCreated', input.catalogId, input.tenantId, input.id, input.occurredAt)); return category; }
  get parentId(): CategoryId | undefined { return this.parentValue; } get path(): CategoryPath { return this.pathValue; } get name(): ProductName { return this.nameValue; }
  moveTo(parentId: CategoryId | undefined, nextPath: CategoryPath, occurredAt: Instant): void { if (parentId === this.id || nextPath.categoryIds.filter((id) => id === this.id).length !== 1 || !nextPath.contains(this.id)) catalogInvariant('CATALOG_CATEGORY_CYCLE', 'Category cannot be moved into its own hierarchy'); this.parentValue = parentId; this.pathValue = nextPath; this.incrementVersion(); this.record(event('CategoryMoved', this.catalog, this.tenant, this.id, occurredAt)); }
}

export class Modifier extends Entity<ModifierId> { constructor(id: ModifierId, public readonly name: ProductName, public readonly active = true) { super(id); Object.freeze(this); } }
export class ModifierGroup extends AggregateRoot<ModifierGroupId, CatalogDomainEvent> {
  private modifiers: Modifier[] = [];
  private constructor(private readonly catalog: CatalogId, private readonly tenant: TenantId, id: ModifierGroupId, public readonly name: ProductName, public readonly required: boolean, public readonly minimumSelections: number, public readonly maximumSelections: number) { super(id); if (!Number.isSafeInteger(minimumSelections) || !Number.isSafeInteger(maximumSelections) || minimumSelections < 0 || maximumSelections < minimumSelections || (required && minimumSelections === 0)) catalogInvariant('CATALOG_MODIFIER_SELECTION_INVALID', 'Modifier selection bounds are invalid'); }
  static create(catalogId: CatalogId, tenantId: TenantId, id: ModifierGroupId, name: ProductName, required: boolean, minimumSelections: number, maximumSelections: number, occurredAt: Instant): ModifierGroup { const group = new ModifierGroup(catalogId, tenantId, id, name, required, minimumSelections, maximumSelections); group.record(event('ModifierGroupCreated', catalogId, tenantId, id, occurredAt)); return group; }
  get items(): readonly Modifier[] { return Object.freeze([...this.modifiers]); }
  attach(modifier: Modifier, occurredAt: Instant): void { if (this.modifiers.some((item) => item.id === modifier.id)) catalogInvariant('CATALOG_MODIFIER_DUPLICATE', 'Modifier is already attached'); this.modifiers.push(modifier); this.incrementVersion(); this.record(event('ModifierAttached', this.catalog, this.tenant, this.id, occurredAt)); }
  detach(modifierId: ModifierId, occurredAt: Instant): void { if (!this.modifiers.some((item) => item.id === modifierId)) catalogInvariant('CATALOG_MODIFIER_MISSING', 'Modifier is not attached'); this.modifiers = this.modifiers.filter((item) => item.id !== modifierId); this.incrementVersion(); this.record(event('ModifierDetached', this.catalog, this.tenant, this.id, occurredAt)); }
}

export class Tag extends AggregateRoot<TagId, CatalogDomainEvent> {
  private constructor(private readonly catalog: CatalogId, private readonly tenant: TenantId, id: TagId, private nameValue: TagName) { super(id); }
  static create(catalogId: CatalogId, tenantId: TenantId, id: TagId, name: TagName): Tag { return new Tag(catalogId, tenantId, id, name); }
  get name(): TagName { return this.nameValue; }
  rename(name: TagName): void { this.nameValue = name; this.incrementVersion(); }
}
