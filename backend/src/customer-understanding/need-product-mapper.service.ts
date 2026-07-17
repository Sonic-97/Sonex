import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CustomerNeed,
  NeedCatalogProduct,
  NeedRecommendation,
  ProductUnderstandingTag,
} from './customer-need.types';
import { ProductUnderstandingTagService } from './product-understanding-tag.service';

const TAG_REASONS: Partial<Record<ProductUnderstandingTag, string>> = {
  CAFFEINATED: 'فيه كافيين حسب بيانات المنتج',
  HIGH_CAFFEINE: 'كافيينه عالٍ حسب بيانات المنتج',
  LOW_CAFFEINE: 'كافيينه خفيف',
  CAFFEINE_FREE: 'من غير كافيين',
  HOT: 'سخن',
  COLD: 'ساقع',
  LOW_SUGAR: 'قليل السكر',
  SWEET: 'اختيار حلو',
  LIGHT: 'خفيف',
  FILLING: 'مشبع',
  BREAKFAST: 'مناسب للفطار',
  QUICK_PREP: 'تجهيزه سريع',
  PORTABLE: 'مناسب وأنت مستعجل',
  BUDGET: 'اختيار اقتصادي',
  PREMIUM: 'اختيار مميز',
  FAMILIAR: 'اختيار معروف',
  NEW: 'منتج جديد',
};

@Injectable()
export class NeedProductMapperService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagService: ProductUnderstandingTagService,
  ) {}

  async find(
    cafeId: string,
    branchId: string,
    need: CustomerNeed,
    options: { deliveryFee?: number; recentProductIds?: string[]; max?: number } = {},
  ): Promise<NeedRecommendation[]> {
    const products = await this.prisma.product.findMany({
      where: {
        cafeId,
        active: true,
        OR: [{ branchId }, { branchId: null }],
      },
      include: {
        branchProducts: { where: { cafeId, branchId } },
      },
    });
    const catalog: NeedCatalogProduct[] = products.map((product: any) => ({
      id: product.id,
      cafeId: product.cafeId,
      branchId: product.branchId,
      name: product.name,
      category: product.category,
      categoryId: product.categoryId,
      active: product.active,
      price: Number(product.price),
      branchPrice: product.branchProducts[0] ? Number(product.branchProducts[0].price) : undefined,
      branchAvailable: product.branchProducts[0]?.isAvailable,
      tags: this.tagService.parse(product.understandingTags),
      recentOrderCount: options.recentProductIds?.filter((id) => id === product.id).length || 0,
    }));
    return this.rank(need, catalog, options);
  }

  rank(
    need: CustomerNeed,
    products: NeedCatalogProduct[],
    options: { deliveryFee?: number; recentProductIds?: string[]; max?: number } = {},
  ): NeedRecommendation[] {
    const deliveryFee = Math.max(0, options.deliveryFee || 0);
    const recentIds = new Set(options.recentProductIds || []);
    const targetTags = this.targetTags(need);
    const strictGroups = this.strictTagGroups(need);
    const scored: NeedRecommendation[] = [];

    for (const product of products) {
      if (!product.active || product.branchAvailable === false) continue;
      const price = product.branchPrice ?? product.price;
      const finalPrice = this.round(price + deliveryFee);
      if (need.budgetMax !== null && finalPrice > need.budgetMax) continue;
      if (strictGroups.some((group) => !group.some((tag) => product.tags.includes(tag)))) continue;

      const matchedTags = targetTags.filter((tag) => product.tags.includes(tag));
      const requiresGroundedMatch = !['HELP_ME_CHOOSE', 'EXPLORATION_REQUEST', 'UNKNOWN_NEED', 'MOOD_IMPROVEMENT_REQUEST'].includes(need.primaryIntent);
      if (requiresGroundedMatch && targetTags.length && !matchedTags.length) continue;

      let score = matchedTags.length * 10;
      if (product.tags.includes('FAMILIAR') || recentIds.has(product.id)) score += need.novelty === 'FAMILIAR' ? 8 : 1;
      if (product.tags.includes('NEW') && need.novelty === 'WANTS_NEW') score += 8;
      if (product.tags.includes('BUDGET') && need.budgetSensitivity) score += 4;
      if (need.morningFastMode && product.tags.includes('QUICK_PREP')) score += 3;
      if ((need.urgency === 'HIGH' || need.urgency === 'IMMEDIATE') && product.tags.includes('PORTABLE')) score += 2;
      score += Math.max(0, 2 - finalPrice / 1000);

      const reasonTags = matchedTags.length
        ? matchedTags
        : product.tags.filter((tag) => ['FAMILIAR', 'NEW', 'BUDGET', 'QUICK_PREP'].includes(tag)).slice(0, 2);
      scored.push({
        productId: product.id,
        productName: product.name,
        category: product.category,
        categoryId: product.categoryId,
        unitPrice: this.round(price),
        deliveryFee: this.round(deliveryFee),
        finalPrice,
        currency: 'EGP',
        tags: [...product.tags],
        matchedTags,
        reason: this.reason(reasonTags),
        score: this.round(score),
      });
    }

    return scored
      .sort((a, b) => b.score - a.score || a.finalPrice - b.finalPrice || a.productName.localeCompare(b.productName, 'ar'))
      .slice(0, Math.min(3, Math.max(1, options.max || 3)));
  }

  async revalidate(cafeId: string, branchId: string, candidate: NeedRecommendation, budgetMax: number | null): Promise<NeedRecommendation | null> {
    const product = await this.prisma.product.findFirst({
      where: { id: candidate.productId, cafeId, active: true, OR: [{ branchId }, { branchId: null }] },
      include: { branchProducts: { where: { cafeId, branchId } } },
    });
    if (!product || product.branchProducts[0]?.isAvailable === false) return null;
    const unitPrice = Number(product.branchProducts[0]?.price ?? product.price);
    const finalPrice = this.round(unitPrice + candidate.deliveryFee);
    if (budgetMax !== null && finalPrice > budgetMax) return null;
    return {
      ...candidate,
      productName: product.name,
      category: product.category,
      categoryId: product.categoryId,
      unitPrice,
      finalPrice,
      tags: this.tagService.parse(product.understandingTags),
    };
  }

  private targetTags(need: CustomerNeed): ProductUnderstandingTag[] {
    const tags = new Set<ProductUnderstandingTag>();
    if (need.desiredEffect === 'ENERGY') tags.add('CAFFEINATED');
    if (need.desiredEffect === 'REFRESHMENT') tags.add('COLD');
    if (need.desiredEffect === 'HUNGER_RELIEF' && need.food === 'FILLING') tags.add('FILLING');
    if (need.desiredEffect === 'SWEET_CRAVING') tags.add('SWEET');
    if (need.desiredEffect === 'ROUTINE') tags.add('FAMILIAR');
    if (need.temperature === 'HOT') tags.add('HOT');
    if (need.temperature === 'COLD') tags.add('COLD');
    if (need.sweetness === 'NONE' || need.sweetness === 'LOW') tags.add('LOW_SUGAR');
    if (need.sweetness === 'HIGH') tags.add('SWEET');
    if (need.caffeine === 'NONE') tags.add('CAFFEINE_FREE');
    if (need.caffeine === 'LOW') tags.add('LOW_CAFFEINE');
    if (need.caffeine === 'HIGH') tags.add('HIGH_CAFFEINE');
    if (need.food === 'LIGHT') tags.add('LIGHT');
    if (need.food === 'BREAKFAST') tags.add('BREAKFAST');
    if (need.food === 'FILLING') tags.add('FILLING');
    if (need.novelty === 'WANTS_NEW') tags.add('NEW');
    if (need.novelty === 'FAMILIAR') tags.add('FAMILIAR');
    if (need.budgetSensitivity) tags.add('BUDGET');
    if (need.urgency === 'HIGH' || need.urgency === 'IMMEDIATE' || need.primaryIntent === 'QUICK_ORDER') tags.add('QUICK_PREP');
    return [...tags];
  }

  private strictTagGroups(need: CustomerNeed): ProductUnderstandingTag[][] {
    const groups: ProductUnderstandingTag[][] = [];
    if (need.temperature === 'HOT') groups.push(['HOT']);
    if (need.temperature === 'COLD') groups.push(['COLD']);
    if (need.sweetness === 'NONE' || need.sweetness === 'LOW') groups.push(['LOW_SUGAR']);
    if (need.sweetness === 'HIGH') groups.push(['SWEET']);
    if (need.caffeine === 'NONE') groups.push(['CAFFEINE_FREE']);
    if (need.caffeine === 'HIGH' || need.desiredEffect === 'ENERGY') groups.push(['HIGH_CAFFEINE', 'CAFFEINATED']);
    if (need.food === 'LIGHT') groups.push(['LIGHT']);
    if (need.food === 'BREAKFAST') groups.push(['BREAKFAST']);
    if (need.food === 'FILLING') groups.push(['FILLING']);
    if (need.novelty === 'WANTS_NEW') groups.push(['NEW']);
    if (need.novelty === 'FAMILIAR') groups.push(['FAMILIAR']);
    if (need.urgency === 'HIGH' || need.urgency === 'IMMEDIATE' || need.primaryIntent === 'QUICK_ORDER') groups.push(['QUICK_PREP']);
    return groups;
  }

  private reason(tags: ProductUnderstandingTag[]): string {
    const reasons = tags.map((tag) => TAG_REASONS[tag]).filter(Boolean);
    return reasons.length ? reasons.slice(0, 3).join('، ') : 'من المنتجات المتاحة حاليًا';
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
