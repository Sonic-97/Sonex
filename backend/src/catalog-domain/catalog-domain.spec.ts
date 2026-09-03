import { instant, tenantId, type AggregateRepository, type RepositoryContext, noCancellation, correlationId, expectedVersion, failure, success, ConcurrencyError } from '../shared-kernel';
import {
  Barcode, Category, CategoryPath, Catalog, DisplayOrder, MediaReference, Modifier, ModifierGroup, Product, ProductDescription, ProductName, ProductStatus, ProductVariant, SKU, Slug, Tag, TagName, Visibility,
  categoryId, catalogId, modifierGroupId, modifierId, productId, productVariantId, tagId,
  type CreateProduct, type ProductRepository,
} from './index';

describe('Catalog Domain', () => {
  const at = instant('2026-07-30T10:00:00.000Z');
  const tenant = tenantId('tenant-1');
  const catalog = catalogId('catalog-1');
  const product = () => Product.create({ id: productId('product-1'), catalogId: catalog, tenantId: tenant, name: ProductName.from('Cappuccino'), sku: SKU.from('cap-001'), description: ProductDescription.from('Classic coffee'), slug: Slug.from('classic-cappuccino'), barcode: Barcode.from('12345678'), occurredAt: at });

  it('validates immutable catalog value objects', () => {
    expect(SKU.from(' cap-001 ').value).toBe('CAP-001');
    expect(Slug.from('Classic-Cappuccino').value).toBe('classic-cappuccino');
    expect(ProductStatus.published().value).toBe('PUBLISHED');
    expect(Visibility.hidden().value).toBe('HIDDEN');
    expect(DisplayOrder.from(2).value).toBe(2);
    expect(MediaReference.from('https://cdn.sonex.example/cap.png', 'Cup').uri).toContain('https://');
    expect(() => SKU.from('bad sku')).toThrow('SKU must contain');
    expect(() => ProductStatus.from('DELETED')).toThrow('Invalid product status');
  });

  it('validates category paths and prevents cyclic category moves', () => {
    const root = categoryId('category-root');
    const child = categoryId('category-child');
    expect(CategoryPath.from([root, child]).contains(root)).toBe(true);
    expect(() => CategoryPath.from([root, root])).toThrow('Category path cannot contain');
    const category = Category.create({ id: child, catalogId: catalog, tenantId: tenant, name: ProductName.from('Coffee'), parentId: root, path: CategoryPath.from([root, child]), occurredAt: at });
    expect(() => category.moveTo(child, CategoryPath.from([child]), at)).toThrow('Category cannot be moved');
    category.moveTo(undefined, CategoryPath.from([child]), at);
    expect(category.pullDomainEvents().map((event) => event.name)).toEqual(['CategoryCreated', 'CategoryMoved']);
  });

  it('enforces product lifecycle and immutable published identifiers', () => {
    const item = product();
    item.publish(at);
    expect(item.status.value).toBe('PUBLISHED');
    expect(() => item.changeIdentifiers(SKU.from('CAP-002'), undefined, undefined, at)).toThrow('Published product identifiers are immutable');
    item.changeVisibility(Visibility.hidden(), at);
    item.archive(at);
    expect(() => item.rename(ProductName.from('New name'), at)).toThrow('Archived product cannot be modified');
    expect(item.pullDomainEvents().map((event) => event.name)).toEqual(['ProductCreated', 'ProductPublished', 'VisibilityChanged', 'ProductArchived']);
  });

  it('owns variants, tags, media, availability flags, relationships, and modifier-group references without pricing', () => {
    const item = product();
    const variant = new ProductVariant(productVariantId('variant-large'), ProductName.from('Large'), DisplayOrder.from(1));
    item.addVariant(variant, at);
    item.attachTag(tagId('tag-hot'), at);
    item.addMedia(MediaReference.from('https://cdn.sonex.example/cap.png'), at);
    item.attachModifierGroup(modifierGroupId('group-milk'), at);
    item.relateTo(productId('product-2'), at);
    item.setAvailable(false, at);
    expect(item.variants).toEqual([variant]);
    expect(item.tags).toEqual([tagId('tag-hot')]);
    expect(item.isAvailable).toBe(false);
    expect(() => item.relateTo(item.id, at)).toThrow('Product cannot be related to itself');
    expect(() => item.attachTag(tagId('tag-hot'), at)).toThrow('Tag is already attached');
  });

  it('keeps modifier groups internally consistent and publishes domain events', () => {
    const group = ModifierGroup.create(catalog, tenant, modifierGroupId('group-syrup'), ProductName.from('Syrup'), false, 0, 2, at);
    const modifier = new Modifier(modifierId('modifier-vanilla'), ProductName.from('Vanilla'));
    group.attach(modifier, at);
    expect(group.items).toEqual([modifier]);
    expect(() => group.attach(modifier, at)).toThrow('Modifier is already attached');
    group.detach(modifier.id, at);
    expect(group.pullDomainEvents().map((event) => event.name)).toEqual(['ModifierGroupCreated', 'ModifierAttached', 'ModifierDetached']);
    expect(() => ModifierGroup.create(catalog, tenant, modifierGroupId('invalid-group'), ProductName.from('Invalid'), true, 0, 1, at)).toThrow('Modifier selection bounds are invalid');
  });

  it('models Catalog and Tag as tenant-scoped aggregates', () => {
    const root = Catalog.create(catalog, tenant);
    const tag = Tag.create(catalog, tenant, tagId('tag-iced'), TagName.from('Iced'));
    tag.rename(TagName.from('Cold drinks'));
    expect(root.tenantId).toBe(tenant);
    expect(tag.name.value).toBe('Cold drinks');
  });

  it('exposes immutable CQRS command contracts and repository interfaces without infrastructure', async () => {
    const command: CreateProduct = Object.freeze({ kind: 'COMMAND', type: 'CATALOG_CREATE_PRODUCT', payload: Object.freeze({ catalogId: catalog, productId: productId('product-command'), name: ProductName.from('Tea'), sku: SKU.from('TEA-001') }) });
    const context: RepositoryContext = { tenantId: tenant, correlationId: correlationId('correlation-1'), cancellationToken: noCancellation };
    const repository: ProductRepository = {
      async findById() { return undefined; }, async findPage() { return { items: [], limit: 10 }; },
      async save() { return success(product()); }, async remove() { return success(undefined); },
      async existsBySku() { return false; },
    };
    expect(command.payload.sku.value).toBe('TEA-001');
    expect(await repository.existsBySku(catalog, command.payload.sku, context)).toBe(false);
    expect(repository).toBeDefined();
  });
});
