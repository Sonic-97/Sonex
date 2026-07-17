import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  CommerceContext, AiCommerceDecision, CommerceIntent, NextAction,
  MissingField, Recommendation, StructuredReplyData, ExtractedEntities,
  ReasoningCode, ALL_INTENTS, ALL_NEXT_ACTIONS, ALL_REASONING_CODES,
} from './commerce-brain.types';

declare const process: {
  env: { [key: string]: string | undefined };
};

@Injectable()
export class DeepSeekIntegrationService {
  private readonly logger = new Logger(DeepSeekIntegrationService.name);

  async decide(
    message: string,
    context: CommerceContext,
  ): Promise<AiCommerceDecision | null> {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('DEEPSEEK_API_KEY is missing — AI unavailable');
      return null;
    }

    const attempt1 = await this.callDeepSeek(message, context, 15000);
    if (attempt1) return attempt1;

    const minimalContext = this.buildMinimalContext(context);
    const attempt2 = await this.callDeepSeek(message, minimalContext, 10000);
    if (attempt2) return attempt2;

    return null;
  }

  private async callDeepSeek(
    message: string,
    context: CommerceContext,
    timeout: number,
  ): Promise<AiCommerceDecision | null> {
    try {
      const response = await axios.post(
        'https://api.deepseek.com/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: this.buildSystemPrompt(context) },
            { role: 'user', content: message },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout,
        },
      );

      const aiText = response.data?.choices?.[0]?.message?.content;
      if (!aiText) return null;

      const parsed = this.safeParseJson(aiText);
      if (!parsed) return null;

      return this.normalizeDecision(parsed);
    } catch (error) {
      this.logger.error(`DeepSeek call failed (timeout=${timeout}ms)`, error);
      return null;
    }
  }

  private buildSystemPrompt(context: CommerceContext): string {
    const { business, customer, catalog, activeOrder, conversation } = context;
    const lines: string[] = [];

    lines.push(`You are a commerce assistant for ${business.name}, a ${business.businessType}.`);
    lines.push('');
    lines.push(`Business personality: ${business.personality}`);
    lines.push(`Greeting style: ${business.greetingStyle}`);
    lines.push(`Currently open: ${business.workingNow ? 'Yes' : 'No'}`);
    lines.push(`Upselling allowed: ${business.deliveryAvailable || business.pickupAvailable ? 'Yes' : 'No'}`);
    lines.push(`Promotions active: ${business.promotionEnabled ? 'Yes' : 'No'}`);
    lines.push(`Current time: ${new Date().toISOString()} (${business.timezone})`);
    lines.push('');

    if (catalog.products.length > 0) {
      lines.push('AVAILABLE PRODUCTS:');
      for (const p of catalog.products.slice(0, 20)) {
        const variants = p.variants.map(v => `${v.name}(${v.type})`).join(', ') || 'none';
        const options = [...p.requiredOptions, ...p.optionalOptions]
          .map(o => `${o.name}[${o.choices.join(', ')}]`).join('; ') || 'none';
        lines.push(`- id:${p.productId} | ${p.name} | cat:${p.category} | variants:${variants} | options:${options}`);
      }
      lines.push('');
    }

    if (customer) {
      lines.push(`CUSTOMER: ${customer.firstName} (lang: ${customer.preferredLanguage})`);
      if (customer.favoriteProducts.length > 0) {
        lines.push(`Favorites: ${customer.favoriteProducts.join(', ')}`);
      }
      if (customer.recentOrders.length > 0) {
        lines.push(`Recent orders: ${customer.recentOrders.map(o => `[${o.items.join(', ')}]`).join(' -> ')}`);
      }
      if (customer.savedAddresses.length > 0) {
        lines.push(`Known addresses: ${customer.savedAddresses.join(', ')}`);
      }
      lines.push('');
    }

    if (activeOrder && activeOrder.items.length > 0) {
      lines.push('CURRENT ORDER:');
      for (const item of activeOrder.items) {
        const opts = item.selectedOptions.map(o => o.choiceLabel).join(', ');
        lines.push(`- ${item.quantity}x ${item.productName}${opts ? ` (${opts})` : ''} = ${item.lineTotal}`);
      }
      lines.push(`Running total: ${activeOrder.runningTotal} | Method: ${activeOrder.deliveryMethod}`);
      lines.push('');
    }

    lines.push('CONVERSATION STATE:');
    lines.push(`Current step: ${conversation.currentStep || 'NEW'}`);
    if (conversation.collectedInformation && Object.keys(conversation.collectedInformation).length > 0) {
      lines.push(`Collected: ${JSON.stringify(conversation.collectedInformation)}`);
    }
    if (conversation.missingInformation && conversation.missingInformation.length > 0) {
      lines.push(`Still needed: ${conversation.missingInformation.join(', ')}`);
    }
    lines.push('');

    lines.push(this.getRulesSection());

    return lines.join('\n');
  }

  private buildMinimalContext(context: CommerceContext): CommerceContext {
    const { business, customer, conversation } = context;
    return {
      business,
      customer: customer ? {
        customerId: customer.customerId,
        firstName: customer.firstName,
        preferredLanguage: customer.preferredLanguage,
        favoriteProducts: customer.favoriteProducts.slice(0, 3),
        recentOrders: customer.recentOrders.slice(0, 2),
        savedAddresses: customer.savedAddresses.slice(0, 1),
        loyaltySummary: customer.loyaltySummary,
      } : undefined,
      conversation,
      catalog: {
        products: context.catalog.products.slice(0, 5),
        totalCount: Math.min(context.catalog.products.length, 5),
      },
      activeOrder: context.activeOrder ? {
        items: context.activeOrder.items.slice(0, 3),
        runningTotal: context.activeOrder.runningTotal,
        deliveryMethod: context.activeOrder.deliveryMethod,
      } : undefined,
    };
  }

  private getRulesSection(): string {
    return [
      'RULES (Non-Negotiable):',
      '1. You may ONLY reference products from the AVAILABLE PRODUCTS list above.',
      '2. You may NOT invent products, prices, inventory, availability, or discounts.',
      '3. You may NOT make commitments about price, discounts, or stock.',
      '4. You may NOT create, modify, or cancel orders. Only suggest and guide.',
      '5. If the user wants an action that changes data, set nextAction to CONFIRM_ORDER.',
      '6. Output ONLY valid JSON. No markdown, no explanation, no extra text.',
      '7. The product list is display reference only. You NEVER calculate totals.',
      '8. When recommending, use productId exactly as shown in the list.',
      '9. If the user asks about a product NOT in the list, respond with PRODUCT_NOT_FOUND.',
      '10. If multiple products match, use MULTIPLE_MATCHES reasoningCode.',
      '11. If confidence < 0.60, use LOW_CONFIDENCE reasoningCode and suggest alternatives.',
      '12. If business is closed, use BUSINESS_CLOSED reasoningCode.',
      '13. If customer not found, use CUSTOMER_NOT_FOUND reasoningCode.',
      '14. You MUST output JSON matching the schema below exactly.',
      '',
      'OUTPUT SCHEMA:',
      JSON.stringify({
        intent: 'ORDER',
        confidence: 0.95,
        requiredConfirmation: false,
        missingInformation: [
          { field: 'variant', required: true, choices: ['Small', 'Large'], reason: 'Product has multiple sizes' },
        ],
        recommendations: [
          { productId: 'uuid', reason: 'Popular choice', priority: 1 },
        ],
        nextAction: 'ASK_OPTION',
        structuredReplyData: {
          title: 'Optional title',
          bodyKey: 'order.confirm',
          buttonIds: ['confirm', 'cancel'],
          variables: { productName: 'Cappuccino' },
        },
        extractedEntities: {
          productNames: ['Cappuccino'],
          quantities: [{ productName: 'Cappuccino', quantity: 2 }],
        },
        reasoningCode: 'CONTINUE_CONVERSATION',
      }, null, 2),
      '',
      `VALID INTENTS: ${ALL_INTENTS.join(', ')}`,
      `VALID NEXT_ACTIONS: ${ALL_NEXT_ACTIONS.join(', ')}`,
      `VALID REASONING_CODES: ${ALL_REASONING_CODES.join(', ')}`,
      '',
      'VALID CONFIDENCE VALUES: 0.0 to 1.0 (0.90+ proceed, 0.60-0.89 ask clarification, <0.60 do not guess)',
      'requiredConfirmation: true when the action changes order state or costs money',
      '',
      'Return ONLY valid JSON matching the schema above. No other text.',
    ].join('\n');
  }

  private safeParseJson(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'string') return null;
    let cleaned = value.trim();
    if (!cleaned) return null;
    cleaned = cleaned
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const attempts = [
      () => JSON.parse(cleaned),
      () => {
        const match = cleaned.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : undefined;
      },
    ];

    for (const attempt of attempts) {
      try {
        const result = attempt();
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          return result as Record<string, unknown>;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private normalizeDecision(raw: Record<string, unknown>): AiCommerceDecision | null {
    const intent = this.normalizeIntent(raw.intent);
    const nextAction = this.normalizeNextAction(raw.nextAction);
    const reasoningCode = this.normalizeReasoningCode(raw.reasoningCode);

    return {
      intent,
      confidence: this.normalizeConfidence(raw.confidence),
      requiredConfirmation: raw.requiredConfirmation === true,
      missingInformation: this.normalizeMissingInfo(raw.missingInformation),
      recommendations: this.normalizeRecommendations(raw.recommendations),
      nextAction,
      structuredReplyData: this.normalizeReplyData(raw.structuredReplyData),
      extractedEntities: this.normalizeEntities(raw.extractedEntities),
      reasoningCode,
    };
  }

  private normalizeIntent(value: unknown): CommerceIntent {
    if (typeof value === 'string' && ALL_INTENTS.includes(value as CommerceIntent)) {
      return value as CommerceIntent;
    }
    return 'UNKNOWN';
  }

  private normalizeNextAction(value: unknown): NextAction {
    if (typeof value === 'string' && ALL_NEXT_ACTIONS.includes(value as NextAction)) {
      return value as NextAction;
    }
    return 'NO_ACTION';
  }

  private normalizeReasoningCode(value: unknown): ReasoningCode {
    if (typeof value === 'string' && ALL_REASONING_CODES.includes(value as ReasoningCode)) {
      return value as ReasoningCode;
    }
    return 'CONTINUE_CONVERSATION';
  }

  private normalizeConfidence(value: unknown): number {
    if (typeof value === 'number' && value >= 0 && value <= 1) {
      return Math.round(value * 100) / 100;
    }
    return 0.5;
  }

  private normalizeMissingInfo(value: unknown): MissingField[] {
    if (!Array.isArray(value)) return [];
    return value.reduce((acc: MissingField[], item: unknown) => {
      if (typeof item !== 'object' || item === null) return acc;
      const obj = item as Record<string, unknown>;
      const field = String(obj.field || '');
      if (!field) return acc;
      acc.push({
        field,
        required: obj.required !== false,
        choices: Array.isArray(obj.choices) ? obj.choices.map(String) : undefined,
        reason: typeof obj.reason === 'string' ? obj.reason : undefined,
      });
      return acc;
    }, []);
  }

  private normalizeRecommendations(value: unknown): Recommendation[] {
    if (!Array.isArray(value)) return [];
    return value.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return null;
      const obj = item as Record<string, unknown>;
      return {
        productId: String(obj.productId || ''),
        reason: String(obj.reason || 'Recommended'),
        priority: typeof obj.priority === 'number' ? obj.priority : 0,
      };
    }).filter((r): r is Recommendation => r !== null && r.productId.length > 0);
  }

  private normalizeReplyData(value: unknown): StructuredReplyData {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { bodyKey: 'general.response' };
    }
    const obj = value as Record<string, unknown>;
    return {
      title: typeof obj.title === 'string' ? obj.title : undefined,
      bodyKey: typeof obj.bodyKey === 'string' ? obj.bodyKey : 'general.response',
      buttonIds: Array.isArray(obj.buttonIds) ? obj.buttonIds.map(String) : undefined,
      variables: typeof obj.variables === 'object' && obj.variables !== null && !Array.isArray(obj.variables)
        ? obj.variables as Record<string, string>
        : undefined,
    };
  }

  private normalizeEntities(value: unknown): ExtractedEntities {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }
    const obj = value as Record<string, unknown>;
    const entities: ExtractedEntities = {};

    if (Array.isArray(obj.productNames)) {
      entities.productNames = obj.productNames.map(String).filter(Boolean);
    }
    if (Array.isArray(obj.quantities)) {
      entities.quantities = obj.quantities
        .map((q: unknown) => {
          if (typeof q !== 'object' || q === null) return null;
          const qObj = q as Record<string, unknown>;
          return {
            productName: String(qObj.productName || ''),
            quantity: typeof qObj.quantity === 'number' ? Math.max(1, Math.floor(qObj.quantity)) : 1,
          };
        })
        .filter((q): q is NonNullable<typeof q> => q !== null && q.productName.length > 0);
    }
    if (typeof obj.variant === 'string') entities.variant = obj.variant;
    if (typeof obj.option === 'string') entities.option = obj.option;
    if (typeof obj.paymentMethod === 'string') entities.paymentMethod = obj.paymentMethod;
    if (typeof obj.address === 'string') entities.address = obj.address;
    if (typeof obj.phone === 'string') entities.phone = obj.phone;
    if (typeof obj.language === 'string') entities.language = obj.language;

    return entities;
  }
}
