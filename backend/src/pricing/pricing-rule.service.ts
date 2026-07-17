import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DynamicPricingRule } from '@prisma/client';
import { CreatePricingRuleDto, UpdatePricingRuleDto } from './dto/pricing-rule.dto';
import { RuleEngine } from './rule-engine.service';
import {
  RuleEvaluationContext,
  PricingBreakdown,
} from './interfaces/pricing.interface';

@Injectable()
export class PricingRuleService {
  private readonly logger = new Logger(PricingRuleService.name);
  private listeners: Array<(event: string, payload: any) => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngine,
  ) {}

  onEvent(callback: (event: string, payload: any) => void): void {
    this.listeners.push(callback);
  }

  private emit(event: string, payload: any): void {
    for (const listener of this.listeners) {
      try { listener(event, payload); } catch { /* ignore */ }
    }
  }

  async create(dto: CreatePricingRuleDto, cafeId: string, branchId?: string): Promise<DynamicPricingRule> {
    if (dto.value < 0) throw new BadRequestException('Value must be non-negative');
    if (dto.validFrom && dto.validTo && new Date(dto.validFrom) >= new Date(dto.validTo)) {
      throw new BadRequestException('validFrom must be before validTo');
    }
    const conditions = dto.conditions || {};
    const productIds = dto.productIds ? JSON.stringify(dto.productIds) : null;
    const categoryIds = dto.categoryIds ? JSON.stringify(dto.categoryIds) : null;

    const rule = await this.prisma.dynamicPricingRule.create({
      data: {
        cafeId,
        name: dto.name,
        ruleType: dto.ruleType,
        value: dto.value,
        priority: dto.priority ?? 0,
        enabled: dto.enabled ?? true,
        currency: dto.currency || 'SAR',
        conditions: conditions,
        productIds,
        categoryIds,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        maxRedemptions: dto.maxRedemptions ?? null,
      },
    });

    this.emit('PricingRuleCreated', { ruleId: rule.id, name: rule.name, cafeId });
    this.logger.log(`Pricing rule created: ${rule.id} (${rule.name})`);
    return rule;
  }

  async findAll(cafeId: string, includeDisabled?: boolean): Promise<DynamicPricingRule[]> {
    const where: any = { cafeId };
    if (!includeDisabled) where.enabled = true;

    return this.prisma.dynamicPricingRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, cafeId?: string): Promise<DynamicPricingRule> {
    const where: any = { id };
    if (cafeId) where.cafeId = cafeId;

    const rule = await this.prisma.dynamicPricingRule.findFirst({ where });
    if (!rule) throw new NotFoundException(`Pricing rule ${id} not found`);
    return rule;
  }

  async update(id: string, dto: UpdatePricingRuleDto, cafeId: string): Promise<DynamicPricingRule> {
    await this.findOne(id, cafeId);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.ruleType !== undefined) data.ruleType = dto.ruleType;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.conditions !== undefined) data.conditions = dto.conditions;
    if (dto.productIds !== undefined) data.productIds = JSON.stringify(dto.productIds);
    if (dto.categoryIds !== undefined) data.categoryIds = JSON.stringify(dto.categoryIds);
    if (dto.validFrom !== undefined) data.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if (dto.validTo !== undefined) data.validTo = dto.validTo ? new Date(dto.validTo) : null;
    if (dto.maxRedemptions !== undefined) data.maxRedemptions = dto.maxRedemptions;

    const rule = await this.prisma.dynamicPricingRule.update({ where: { id }, data });
    this.emit('PricingRuleUpdated', { ruleId: id, cafeId });
    return rule;
  }

  async enable(id: string, cafeId: string): Promise<DynamicPricingRule> {
    await this.findOne(id, cafeId);
    const rule = await this.prisma.dynamicPricingRule.update({ where: { id }, data: { enabled: true } });
    this.emit('PricingRuleActivated', { ruleId: id, cafeId });
    return rule;
  }

  async disable(id: string, cafeId: string): Promise<DynamicPricingRule> {
    await this.findOne(id, cafeId);
    const rule = await this.prisma.dynamicPricingRule.update({ where: { id }, data: { enabled: false } });
    this.emit('PricingRuleDeactivated', { ruleId: id, cafeId });
    return rule;
  }

  async delete(id: string, cafeId: string): Promise<void> {
    await this.findOne(id, cafeId);
    await this.prisma.dynamicPricingRule.delete({ where: { id } });
    this.logger.log(`Pricing rule deleted: ${id}`);
  }

  async getApplicableRules(cafeId: string, context: RuleEvaluationContext): Promise<PricingBreakdown> {
    const rules = await this.findAll(cafeId, false);
    return this.ruleEngine.evaluate(rules, context);
  }

  async previewPrice(
    cafeId: string,
    productId: string,
    quantity: number,
    categoryId?: string,
    category?: string,
  ): Promise<PricingBreakdown> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);

    const now = new Date();
    const context: RuleEvaluationContext = {
      productId,
      categoryId: categoryId || product.categoryId || undefined,
      category: category || product.category,
      quantity: quantity || 1,
      currentPrice: Number(product.price),
      dateTime: now,
      dayOfWeek: now.getDay(),
      hour: now.getHours(),
    };

    return this.getApplicableRules(cafeId, context);
  }

  async incrementRedemptions(ruleId: string): Promise<void> {
    await this.prisma.dynamicPricingRule.update({
      where: { id: ruleId },
      data: { currentRedemptions: { increment: 1 } },
    });
  }
}
