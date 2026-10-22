import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OwnerActionImpact, OwnerActionResource, OwnerActionType } from './owner-action.types';

type DataClient = PrismaService | Record<string, any>;

export interface OwnerActionSnapshot {
  resource: OwnerActionResource;
  currentState: Record<string, unknown>;
  impact: OwnerActionImpact;
  warnings: string[];
  branchNames: string[];
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = stableValue((value as Record<string, unknown>)[key]);
      return result;
    }, {});
  }
  return value;
}

export function hashOwnerActionState(state: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(stableValue(state))).digest('hex');
}

@Injectable()
export class OwnerActionReaderService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(
    actionType: OwnerActionType,
    cafeId: string,
    branchIds: string[],
    resourceId: string | undefined,
    proposedState: Record<string, unknown>,
    dataClient?: DataClient,
  ): Promise<OwnerActionSnapshot> {
    const client = (dataClient ?? this.prisma) as any;
    const branchNames = await this.validateBranches(client, cafeId, branchIds);

    if (['UPDATE_PRODUCT_PRICE', 'UPDATE_PRODUCT_AVAILABILITY', 'DISABLE_PRODUCT', 'ENABLE_PRODUCT'].includes(actionType)) {
      if (!resourceId) throw new BadRequestException('A verified product id is required.');
      const product = await client.product.findFirst({
        where: { id: resourceId, cafeId },
        select: { id: true, name: true, price: true, cost: true, active: true, branchId: true },
      });
      if (!product) throw new NotFoundException('Product not found in this cafe.');

      if (actionType === 'UPDATE_PRODUCT_PRICE') {
        const branchId = branchIds[0];
        const branchProduct = branchId ? await client.branchProduct.findFirst({
          where: { cafeId, branchId, productId: product.id },
          select: { id: true, price: true, isAvailable: true },
        }) : null;
        const currentPrice = branchProduct ? Number(branchProduct.price) : Number(product.price);
        const proposedPrice = Number(proposedState.price);
        const cost = Number(product.cost);
        return {
          resource: { type: 'Product', id: product.id, name: product.name },
          currentState: {
            price: currentPrice,
            cost,
            active: product.active,
            scope: branchId ? 'BRANCH' : 'GLOBAL',
            branchProductId: branchProduct?.id ?? null,
            branchProductAvailable: branchProduct?.isAvailable ?? null,
          },
          impact: {
            financial: `Unit price changes by ${round(proposedPrice - currentPrice)}; historical sales are unchanged.`,
            operational: branchId ? 'Only the selected branch price override changes.' : 'The default product price changes for branches without overrides.',
            customer: 'Future customer prices may change; demand impact is uncertain.',
            unitMarginBefore: round(currentPrice - cost),
            unitMarginAfter: round(proposedPrice - cost),
            whatWillNotChange: ['Product cost', 'Historical orders', 'Collected payments'],
          },
          warnings: proposedPrice < cost ? ['Proposed price is below the current product cost.'] : ['Demand response is an estimate, not a guaranteed outcome.'],
          branchNames: branchIds.length ? branchNames : ['All branches using the default price'],
        };
      }

      if (actionType === 'UPDATE_PRODUCT_AVAILABILITY') {
        const branchId = branchIds[0];
        const branchProduct = await client.branchProduct.findFirst({
          where: { cafeId, branchId, productId: product.id },
          select: { id: true, price: true, isAvailable: true },
        });
        const activeOrders = client.orderItem?.count ? await client.orderItem.count({
          where: {
            productId: product.id,
            order: { cafeId, branchId, status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
          },
        }) : 0;
        return {
          resource: { type: 'Product', id: product.id, name: product.name },
          currentState: {
            isAvailable: branchProduct?.isAvailable ?? product.active,
            branchProductId: branchProduct?.id ?? null,
            branchPrice: branchProduct?.price ?? Number(product.price),
            productActive: product.active,
            activeOrderItems: activeOrders,
          },
          impact: {
            operational: `Availability changes only in ${branchNames[0]}.`,
            customer: `${activeOrders} active order item(s) currently reference this product.`,
            affectedRecords: activeOrders,
            whatWillNotChange: ['Other branches', 'Existing order records', 'Product price'],
          },
          warnings: activeOrders > 0 ? ['Active orders already containing this product are not modified.'] : [],
          branchNames,
        };
      }

      const activeOrders = client.orderItem?.count ? await client.orderItem.count({
        where: {
          productId: product.id,
          order: { cafeId, status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
        },
      }) : 0;
      return {
        resource: { type: 'Product', id: product.id, name: product.name },
        currentState: { active: product.active, price: Number(product.price), cost: Number(product.cost), activeOrderItems: activeOrders },
        impact: {
          operational: 'Global product availability changes for every branch.',
          customer: `The product may disappear from or return to all menus; ${activeOrders} active order item(s) already reference it.`,
          affectedRecords: activeOrders,
          whatWillNotChange: ['Historical orders', 'Product price', 'Product cost'],
        },
        warnings: [
          'This is a global product action. Use branch availability for a branch-only change.',
          'Existing order items are not changed. Durable active-offer checks are unavailable; recommendations will follow product active state.',
        ],
        branchNames: ['All cafe branches'],
      };
    }

    if (actionType === 'UPDATE_MINIMUM_STOCK_LEVEL' || actionType === 'CREATE_RESTOCK_PROPOSAL' || actionType === 'CREATE_PURCHASE_ORDER_DRAFT') {
      if (!resourceId) throw new BadRequestException('A verified inventory item id is required.');
      const item = await client.inventory.findFirst({
        where: { id: resourceId, cafeId, ...(branchIds[0] ? { branchId: branchIds[0] } : {}) },
        select: { id: true, itemName: true, unit: true, currentQty: true, minThreshold: true, costPerUnit: true, branchId: true, version: true },
      });
      if (!item) throw new NotFoundException('Inventory item not found in the trusted branch.');
      const quantity = Number(proposedState.quantity ?? 0);
      return {
        resource: { type: actionType === 'CREATE_PURCHASE_ORDER_DRAFT' ? 'PurchaseDraft' : 'Inventory', id: item.id, name: item.itemName },
        currentState: {
          currentQty: Number(item.currentQty),
          minThreshold: Number(item.minThreshold),
          costPerUnit: Number(item.costPerUnit),
          unit: item.unit,
          version: item.version,
        },
        impact: {
          financial: quantity > 0 ? `Estimated item cost: ${round(quantity * Number(item.costPerUnit))}.` : undefined,
          inventory: actionType === 'UPDATE_MINIMUM_STOCK_LEVEL'
            ? 'Only the reorder alert threshold changes; current stock is untouched.'
            : 'This is a planning draft and does not receive goods or modify stock.',
          whatWillNotChange: ['Current stock quantity', 'Stock ledger', 'Received-goods records'],
        },
        warnings: actionType === 'CREATE_PURCHASE_ORDER_DRAFT' ? ['Supplier and quoted price must be verified outside this draft.'] : [],
        branchNames,
      };
    }

    if (actionType === 'CREATE_APPROVED_EXPENSE' || actionType === 'CREATE_EXPENSE_DRAFT') {
      const expenseDate = new Date(String(proposedState.expenseDate));
      const start = new Date(expenseDate.getTime() - 5 * 60 * 1000);
      const end = new Date(expenseDate.getTime() + 5 * 60 * 1000);
      const duplicate = client.expense?.findFirst ? await client.expense.findFirst({
        where: {
          cafeId,
          branchId: branchIds[0],
          category: String(proposedState.category),
          amount: Number(proposedState.amount),
          description: String(proposedState.description),
          expenseDate: { gte: start, lte: end },
        },
        select: { id: true },
      }) : null;
      return {
        resource: { type: 'Expense', name: String(proposedState.category) },
        currentState: { duplicateExpenseId: duplicate?.id ?? null },
        impact: {
          financial: `Creates an expense of ${round(Number(proposedState.amount))}.`,
          operational: 'The approved record will appear in expense and profit reporting.',
          whatWillNotChange: ['Cash settlement records', 'Payroll', 'Existing expenses'],
        },
        warnings: duplicate ? ['A matching expense already exists near the proposed time.'] : [],
        branchNames,
      };
    }

    if (actionType === 'CREATE_OFFER_DRAFT') {
      const productIds = Array.isArray(proposedState.productIds) ? proposedState.productIds.map(String) : [];
      const products = await client.product.findMany({
        where: { cafeId, id: { in: productIds } },
        select: { id: true, name: true, price: true, cost: true, active: true },
      });
      if (products.length !== new Set(productIds).size || products.some((product: any) => !product.active)) {
        throw new BadRequestException('Offer draft contains a missing or inactive product.');
      }
      const separatePrice = products.reduce((sum: number, product: any) => sum + Number(product.price), 0);
      const totalCost = products.reduce((sum: number, product: any) => sum + Number(product.cost), 0);
      const proposedPrice = Number(proposedState.proposedPrice);
      if (proposedPrice <= totalCost) throw new BadRequestException('Offer price must remain above the verified current product cost.');
      if (proposedState.startsAt || proposedState.endsAt) {
        const startsAt = new Date(String(proposedState.startsAt));
        const endsAt = new Date(String(proposedState.endsAt));
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
          throw new BadRequestException('Offer period is invalid.');
        }
      }
      return {
        resource: { type: 'OfferDraft', id: resourceId, name: String(proposedState.name || 'Offer draft') },
        currentState: {
          products: products.map((product: any) => ({ id: product.id, price: Number(product.price), cost: Number(product.cost), active: product.active })),
          activeOfferConflictCheck: 'UNAVAILABLE_NO_DURABLE_OFFER_MODEL',
        },
        impact: {
          financial: `Separate price ${round(separatePrice)}, draft price ${round(proposedPrice)}, unit margin ${round(proposedPrice - totalCost)}.`,
          customer: `Draft customer saving ${round(separatePrice - proposedPrice)}. No customer can see this draft.`,
          operational: 'Draft only; activation and expiration scheduling are unavailable.',
          unitMarginBefore: round(separatePrice - totalCost),
          unitMarginAfter: round(proposedPrice - totalCost),
          whatWillNotChange: ['Menu visibility', 'Product prices', 'Customer messages', 'Inventory'],
        },
        warnings: ['Offer conflict detection and expiration scheduling require a durable offer model before activation can be enabled.'],
        branchNames,
      };
    }

    if (actionType === 'CREATE_PRODUCT_WITH_RECIPE') {
      const name = String(proposedState.name || 'New Product');
      const price = Number(proposedState.price || 0);
      const categoryName = String(proposedState.categoryName || 'مشروبات');
      const ingredients = Array.isArray(proposedState.ingredients) ? proposedState.ingredients : [];
      const estimatedCost = Number(proposedState.cost || 0);
      return {
        resource: { type: 'ProductWithRecipe', id: resourceId, name },
        currentState: { exists: false },
        impact: {
          financial: `Selling price: ${round(price)} EGP, estimated cost: ${round(estimatedCost)} EGP, estimated unit margin: ${round(price - estimatedCost)} EGP.`,
          operational: `Product "${name}" will be added under category "${categoryName}" with ${ingredients.length} recipe ingredient(s).`,
          customer: 'Product will appear on in-cafe and digital menus upon creation.',
          whatWillNotChange: ['Existing products', 'Historical orders'],
        },
        warnings: price <= estimatedCost && estimatedCost > 0 ? ['Selling price is below or equal to the estimated ingredient cost.'] : [],
        branchNames: branchIds.length ? branchNames : ['All branches'],
      };
    }

    if (actionType === 'RECORD_INVENTORY_PURCHASE') {
      const items = Array.isArray(proposedState.items) ? proposedState.items : [];
      const totalAmount = Number(proposedState.totalAmount || 0);
      const paymentMethod = String(proposedState.paymentMethod || 'CASH');
      return {
        resource: { type: 'InventoryPurchase', id: resourceId, name: `Restock: ${items.map((i: any) => i.name).join(', ')}` },
        currentState: { recorded: false },
        impact: {
          financial: `Total expense of ${round(totalAmount)} EGP via ${paymentMethod} recorded in today's ledger.`,
          operational: `${items.length} inventory item(s) restocked and immediately available for consumption.`,
          whatWillNotChange: ['Previous inventory records', 'Historical sales'],
        },
        warnings: [],
        branchNames,
      };
    }

    if (actionType === 'RECORD_STOCK_WASTE') {
      const itemName = String(proposedState.itemName || 'Inventory Item');
      const quantity = Number(proposedState.quantity || 0);
      const unit = String(proposedState.unit || 'piece');
      const reason = String(proposedState.reason || 'هالك / عجز مخزون');
      return {
        resource: { type: 'StockWaste', id: resourceId, name: `هالك: ${itemName} (${quantity} ${unit})` },
        currentState: { recorded: false },
        impact: {
          financial: 'Loss recorded in stock waste tracking; inventory balances adjusted downward.',
          operational: `Deducts ${quantity} ${unit} from "${itemName}" with reason: ${reason}.`,
          whatWillNotChange: ['Historical sales', 'Order records'],
        },
        warnings: ['Stock reduction is recorded immediately upon approval.'],
        branchNames,
      };
    }

    if (actionType === 'DELETE_PRODUCT') {
      if (!resourceId) throw new BadRequestException('A verified product id is required.');
      const product = await client.product.findFirst({
        where: { id: resourceId, cafeId },
        select: { id: true, name: true, price: true, active: true },
      });
      if (!product) throw new NotFoundException('Product not found in this cafe.');
      const orderCount = client.orderItem?.count ? await client.orderItem.count({
        where: { productId: product.id },
      }) : 0;
      return {
        resource: { type: 'Product', id: product.id, name: product.name },
        currentState: { id: product.id, name: product.name, price: Number(product.price), active: product.active, orderCount },
        impact: {
          financial: `Product "${product.name}" will be removed from future sales. Historical revenue of ${orderCount} past order(s) remains preserved.`,
          operational: orderCount > 0 ? 'Product will be archived/deactivated to preserve past sales data.' : 'Product and associated recipe records will be permanently removed.',
          customer: 'Product will immediately disappear from WhatsApp bot, digital menu, and POS.',
          whatWillNotChange: ['Past orders', 'Financial accounting totals', 'Inventory stock levels'],
        },
        warnings: orderCount > 0 ? ['Product has past orders; safe archival will be performed instead of hard delete to protect audit logs.'] : ['Action is permanent once approved.'],
        branchNames,
      };
    }

    if (actionType === 'UPDATE_PRODUCT_RECIPE') {
      if (!resourceId) throw new BadRequestException('A verified product id is required.');
      const product = await client.product.findFirst({
        where: { id: resourceId, cafeId },
        include: { recipeIngredients: { include: { inventory: true } } },
      });
      if (!product) throw new NotFoundException('Product not found in this cafe.');
      const proposedIngredients = Array.isArray(proposedState.ingredients) ? proposedState.ingredients : [];
      const currentIngredients = product.recipeIngredients.map((ri: any) => ({
        name: ri.inventory?.itemName || 'خامة',
        quantity: Number(ri.quantity),
        unit: ri.unit,
      }));
      const newEstimatedCost = Number(proposedState.cost || 0);
      return {
        resource: { type: 'Recipe', id: product.id, name: `Recipe for ${product.name}` },
        currentState: {
          productId: product.id,
          name: product.name,
          currentCost: Number(product.cost),
          ingredients: currentIngredients,
        },
        impact: {
          financial: `Recipe cost updates from ${round(Number(product.cost))} EGP to ${round(newEstimatedCost)} EGP. New unit margin: ${round(Number(product.price) - newEstimatedCost)} EGP.`,
          operational: `${proposedIngredients.length} ingredient(s) mapped for future automated inventory deduction upon order creation.`,
          whatWillNotChange: ['Product selling price', 'Past inventory deductions'],
        },
        warnings: newEstimatedCost >= Number(product.price) ? ['New recipe cost exceeds or equals current selling price!'] : [],
        branchNames,
      };
    }

    if (actionType === 'CREATE_CATEGORY') {
      const name = String(proposedState.name || 'قسم جديد');
      return {
        resource: { type: 'Category', id: resourceId, name },
        currentState: { exists: false },
        impact: {
          operational: `New category "${name}" will be created in the menu catalog.`,
          customer: 'Category will be available for organizing items in customer menu.',
          whatWillNotChange: ['Existing products', 'Existing categories'],
        },
        warnings: [],
        branchNames,
      };
    }

    if (actionType === 'DELETE_CATEGORY') {
      if (!resourceId) throw new BadRequestException('Category id is required.');
      const category = await client.productCategory.findFirst({
        where: { id: resourceId, cafeId },
        include: { products: { select: { id: true, name: true } } },
      });
      if (!category) throw new NotFoundException('Category not found.');
      return {
        resource: { type: 'Category', id: category.id, name: category.name },
        currentState: { id: category.id, name: category.name, productsCount: category.products.length },
        impact: {
          operational: `Category "${category.name}" will be deleted. ${category.products.length} product(s) will be unassigned.`,
          whatWillNotChange: ['Product existence', 'Order history'],
        },
        warnings: category.products.length > 0 ? [`This category contains ${category.products.length} product(s) which will become uncategorized.`] : [],
        branchNames,
      };
    }

    if (actionType === 'CREATE_ACTIVE_PROMOTION') {
      const name = String(proposedState.name || 'عرض ترويجي');
      const discountType = String(proposedState.discountType || 'PERCENTAGE');
      const discountValue = Number(proposedState.discountValue || 0);
      const minimumOrder = Number(proposedState.minimumOrder || 0);
      return {
        resource: { type: 'Promotion', id: resourceId, name },
        currentState: { exists: false },
        impact: {
          financial: `Discount of ${discountValue}${discountType === 'PERCENTAGE' ? '%' : ' EGP'} with minimum order ${minimumOrder} EGP.`,
          operational: 'Promotion becomes immediately active for WhatsApp bot customers and ordering flows.',
          customer: 'Eligible customers will receive this promotion automatically when placing orders.',
          whatWillNotChange: ['Past orders', 'Base product prices'],
        },
        warnings: ['Active promotions apply automatically to qualifying customer orders.'],
        branchNames,
      };
    }

    return this.draftSnapshot(actionType, branchNames, proposedState);
  }

  private async validateBranches(client: any, cafeId: string, branchIds: string[]): Promise<string[]> {
    if (!branchIds.length) return [];
    const branches = await client.branch.findMany({
      where: { cafeId, id: { in: branchIds }, active: true },
      select: { id: true, name: true },
    });
    if (branches.length !== new Set(branchIds).size) throw new ForbiddenException('Foreign, missing, or inactive branch scope.');
    const names = new Map(branches.map((branch: any) => [branch.id, branch.name]));
    return branchIds.map((id) => String(names.get(id)));
  }

  private draftSnapshot(actionType: OwnerActionType, branchNames: string[], proposedState: Record<string, unknown>): OwnerActionSnapshot {
    const mapping: Partial<Record<OwnerActionType, OwnerActionResource['type']>> = {
      CREATE_OFFER_DRAFT: 'OfferDraft',
      CREATE_CAMPAIGN_DRAFT: 'CampaignDraft',
      CREATE_STAFF_SCHEDULE_DRAFT: 'ScheduleDraft',
      CREATE_CUSTOMER_COMPENSATION_DRAFT: 'CompensationDraft',
    };
    return {
      resource: { type: mapping[actionType] ?? 'OfferDraft', name: String(proposedState.name || actionType) },
      currentState: { persisted: false },
      impact: {
        operational: 'A reviewable draft is prepared in the bounded Stage 6 proposal cache.',
        whatWillNotChange: ['Business records', 'Customer messages', 'Inventory', 'Financial balances'],
      },
      warnings: ['Draft only: the current system has no approved execution model for this action.'],
      branchNames,
    };
  }
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
