import { Injectable } from '@nestjs/common';
import { CoffeeAttributeExtractor } from '../coffee-order/coffee-attribute-extractor';
import { ConversationState, StructuredUnderstanding } from './conversation.types';

const CANCEL_PATTERN = /^(?:الغى|الغي|إلغاء|الغاء|مش عايز أكمل|خلاص مش عايز|cancel)(?:\s|$)/i;
const MENU_PATTERN = /^(?:المنيو|القائمة|menu|وريني)(?:\s|$)/i;
const YES_PATTERN = /^(?:أيوه|ايوه|نعم|أكد|تأكيد|تمام|yes|confirm|ok)$/i;
const NO_PATTERN = /^(?:لا|لأ|لاا|no|nah)$/i;
const COFFEE_PATTERN = /(?:قهوة|قهوه|coffee|تركي)/i;

@Injectable()
export class StructuredUnderstandingService {
  constructor(private readonly coffee: CoffeeAttributeExtractor) {}

  analyze(message: string, state: ConversationState, draft: Record<string, unknown> = {}): StructuredUnderstanding {
    const text = message.trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ـ/g, '');
    const base: StructuredUnderstanding = { language: /[\u0600-\u06ff]/.test(text) ? 'ar-EG' : 'en', intent: 'UNKNOWN', confidence: 0.4, entities: {}, conversationAction: 'ASK_CLARIFICATION', missingFields: [], cancellation: false };
    if (!text) return base;
    if (CANCEL_PATTERN.test(text)) return { ...base, intent: 'CANCEL_ORDER', confidence: 0.99, conversationAction: 'CANCEL', cancellation: true };
    if (MENU_PATTERN.test(text)) return { ...base, intent: 'SHOW_MENU', confidence: 0.98, conversationAction: 'CONTINUE' };
    if (NO_PATTERN.test(text)) {
      if (state === 'AWAITING_COFFEE_BLEND') return this.withCoffee(base, { blend: 'PLAIN' }, draft, 0.98);
      if (state === 'AWAITING_SUGAR') return this.withCoffee(base, { sugar: 'NO_SUGAR' }, draft, 0.98);
      if (state === 'AWAITING_CONFIRMATION') return { ...base, intent: 'REJECT_CONFIRMATION', confidence: 0.99 };
    }
    if (YES_PATTERN.test(text) && state === 'AWAITING_CONFIRMATION') return { ...base, intent: 'CONFIRM_ORDER', confidence: 0.99, conversationAction: 'CONFIRM' };
    const inCoffeeFlow = COFFEE_PATTERN.test(text) || ['AWAITING_COFFEE_ROAST', 'AWAITING_COFFEE_BLEND', 'AWAITING_SUGAR'].includes(state);
    if (!inCoffeeFlow) return base;
    return this.withCoffee(base, { roast: this.coffee.extractRoast(text), blend: this.coffee.extractBlend(text), sugar: this.coffee.extractSugar(text), quantity: this.coffee.extractQuantity(text) }, draft, COFFEE_PATTERN.test(text) ? 0.9 : 0.8);
  }

  private withCoffee(base: StructuredUnderstanding, extracted: Record<string, unknown>, draft: Record<string, unknown>, confidence: number): StructuredUnderstanding {
    const coffee = Object.fromEntries(Object.entries({ ...draft, ...extracted }).filter(([, value]) => value !== undefined));
    const missingFields = (['roast', 'blend', 'sugar'] as const).filter((field) => !coffee[field]);
    return { ...base, intent: 'CREATE_ORDER', confidence, entities: { productQuery: 'coffee', coffee }, missingFields, conversationAction: missingFields.length ? 'ASK_MISSING_FIELD' : 'CONFIRM' };
  }
}
