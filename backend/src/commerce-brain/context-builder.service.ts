import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommerceContext, BusinessContext, CustomerContext,
  ConversationContext, CatalogContext, CatalogProduct,
  ActiveOrderContext, BuildContextInput, BusinessConfiguration,
} from './commerce-brain.types';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async build(input: BuildContextInput): Promise<CommerceContext> {
    if (!input.cafeId) throw new NotFoundException('Business ID is required');
    if (!input.message?.trim()) throw new NotFoundException('Message is required');

    const business = await this.buildBusinessContext(input.cafeId);
    const customer = input.customerId
      ? await this.buildCustomerContext(input.cafeId, input.customerId)
      : undefined;
    const conversation = this.buildConversationContext(input);
    const catalog = await this.findMatchedProducts(input.cafeId, input.message);
    const activeOrder = input.customerId
      ? await this.findActiveOrder(input.cafeId, input.customerId)
      : undefined;

    return { business, customer, conversation, catalog, activeOrder };
  }

  private async buildBusinessContext(cafeId: string): Promise<BusinessContext> {
    const cafe = await this.prisma.cafe.findUnique({
      where: { id: cafeId },
      select: {
        id: true, name: true, category: true, timezone: true,
        active: true, configuration: true,
      },
    });
    if (!cafe) throw new NotFoundException('Business not found');

    const config = (cafe.configuration as BusinessConfiguration) || {};
    const now = new Date();
    const workingNow = cafe.active;

    return {
      id: cafe.id,
      name: cafe.name,
      businessType: cafe.category || 'general',
      language: config.language || 'ar-EG',
      timezone: cafe.timezone || 'Africa/Cairo',
      personality: config.personality || 'friendly',
      greetingStyle: config.greetingStyle || 'casual',
      workingNow,
      deliveryAvailable: config.deliveryAvailable ?? false,
      pickupAvailable: config.pickupAvailable ?? false,
      promotionEnabled: config.promotionEnabled ?? false,
    };
  }

  private async buildCustomerContext(cafeId: string, customerId: string): Promise<CustomerContext | undefined> {
    const cacheKey = `customer:${cafeId}:${customerId}`;
    const cached = this.getCache<CustomerContext>(cacheKey);
    if (cached) return cached;

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true, name: true, preferredLanguage: true,
        preferredProducts: true, savedAddresses: true,
        totalOrders: true, totalSpent: true,
      },
    });
    if (!customer) return undefined;

    const recentOrders = await this.prisma.order.findMany({
      where: { cafeId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        createdAt: true,
        total: true,
        items: {
          select: { product: { select: { name: true } }, quantity: true },
        },
      },
    });

    const defaultLanguage = customer.preferredLanguage || 'ar-EG';
    const favoriteProducts = this.extractFavoriteProducts(customer.preferredProducts);
    const savedAddresses = Array.isArray(customer.savedAddresses) ? customer.savedAddresses as string[] : [];

    const result: CustomerContext = {
      customerId: customer.id,
      firstName: customer.name || 'Customer',
      preferredLanguage: defaultLanguage,
      favoriteProducts,
      recentOrders: recentOrders.map(o => ({
        items: o.items.map(i => i.product.name),
        date: o.createdAt.toISOString(),
        total: Number(o.total).toFixed(2),
      })),
      savedAddresses,
      loyaltySummary: {
        totalOrders: customer.totalOrders,
        totalSpent: Number(customer.totalSpent).toFixed(2),
      },
    };

    this.setCache(cacheKey, result, 60 * 1000);
    return result;
  }

  private buildConversationContext(input: BuildContextInput): ConversationContext {
    return {
      currentIntent: input.currentIntent || undefined,
      currentStep: input.currentStep || 'NEW',
      collectedInformation: input.collectedInformation || {},
      missingInformation: input.missingInformation || [],
    };
  }

  private async findMatchedProducts(cafeId: string, message: string): Promise<CatalogContext> {
    if (!message?.trim()) return { products: [], totalCount: 0 };

    const cleaned = message.toLowerCase().trim();
    const cacheKey = `product-names:${cafeId}`;
    let productNames = this.getCache<Array<{ id: string; name: string }>>(cacheKey);
    if (!productNames) {
      productNames = await this.prisma.product.findMany({
        where: { cafeId, active: true },
        select: { id: true, name: true },
      });
      this.setCache(cacheKey, productNames, 60 * 1000);
    }

    const matchedIds = productNames
      .filter(p => cleaned.includes(p.name.toLowerCase()))
      .map(p => p.id);

    if (matchedIds.length === 0) return { products: [], totalCount: 0 };

    const products = await this.prisma.product.findMany({
      where: { id: { in: matchedIds } },
      select: {
        id: true, name: true, category: true, active: true,
        variants: true, options: { select: { id: true, name: true, required: true, choices: true, sortOrder: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      products: products.map(p => this.toCatalogProduct(p)),
      totalCount: products.length,
    };
  }

  private toCatalogProduct(p: {
    id: string; name: string; category: string; active: boolean;
    variants: unknown; options: Array<{ id: string; name: string; required: boolean; choices: unknown; sortOrder: number }>;
  }): CatalogProduct {
    const variants = Array.isArray(p.variants) ? p.variants as Array<{ name: string; type: string; priceAdjust?: number }> : [];
    const options = Array.isArray(p.options) ? p.options : [];

    const requiredOptions = options
      .filter(o => o.required)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(o => ({
        name: o.name,
        choices: this.extractOptionChoices(o.choices),
      }));

    const optionalOptions = options
      .filter(o => !o.required)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(o => ({
        name: o.name,
        choices: this.extractOptionChoices(o.choices),
      }));

    return {
      productId: p.id,
      name: p.name,
      category: p.category,
      available: p.active,
      variants,
      requiredOptions,
      optionalOptions,
    };
  }

  private extractOptionChoices(choices: unknown): string[] {
    if (!Array.isArray(choices)) return [];
    return choices.map((c: unknown) => {
      if (typeof c === 'string') return c;
      if (typeof c === 'object' && c !== null) {
        const obj = c as Record<string, unknown>;
        return String(obj.label ?? obj.name ?? '');
      }
      return '';
    }).filter(Boolean);
  }

  private async findActiveOrder(cafeId: string, customerId: string): Promise<ActiveOrderContext | undefined> {
    const order = await this.prisma.inCafeOrder.findFirst({
      where: { cafeId, customerId, status: { in: ['NEW', 'CONFIRMED', 'PREPARING'] } },
      select: {
        orderType: true,
        items: {
          select: {
            quantity: true,
            selectedOptions: true,
            unitPrice: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!order || order.items.length === 0) return undefined;

    return {
      items: order.items.map(item => ({
        productName: item.product.name,
        quantity: item.quantity,
        selectedOptions: (item.selectedOptions as Array<{ optionId: string; choiceLabel: string }>) || [],
        lineTotal: (item.quantity * Number(item.unitPrice)).toFixed(2),
      })),
      runningTotal: order.items
        .reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0)
        .toFixed(2),
      deliveryMethod: order.orderType || 'DINE_IN',
    };
  }

  private extractFavoriteProducts(preferredProducts: unknown): string[] {
    if (!preferredProducts) return [];
    if (Array.isArray(preferredProducts)) {
      return preferredProducts.map((p: unknown) => {
        if (typeof p === 'string') return p;
        if (typeof p === 'object' && p !== null) {
          const obj = p as Record<string, unknown>;
          return String(obj.name ?? obj.productName ?? '');
        }
        return '';
      }).filter(Boolean);
    }
    if (typeof preferredProducts === 'object' && preferredProducts !== null) {
      const obj = preferredProducts as Record<string, unknown>;
      const names = obj.names ?? obj.products ?? [];
      return Array.isArray(names) ? names.map(String).filter(Boolean) : [];
    }
    return [];
  }

  private getCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  private setCache<T>(key: string, data: T, ttlMs?: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.CACHE_TTL_MS),
    });
  }
}
