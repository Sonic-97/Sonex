import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

declare const process: {
  env: { [key: string]: string | undefined };
};

export type AiOrderIntent = {
  intent: 'create_order' | 'inquiry' | 'complaint';
  type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  items: Array<{
    productName: string;
    quantity: number;
    size: 'S' | 'M' | 'L';
    sugar: '0' | '50' | '100';
    extras: string[];
    notes?: string;
  }>;
  confidence: number;
};

const VALID_INTENTS = ['create_order', 'inquiry', 'complaint'] as const;
const VALID_TYPES = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const;
const VALID_SIZES = ['S', 'M', 'L'] as const;
const VALID_SUGARS = ['0', '50', '100'] as const;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async parseMessage(
    message: string,
    productContext?: Array<{ id: string; name: string; category: string; price: any }>,
  ): Promise<AiOrderIntent> {
    if (!message?.trim()) {
      return this.emptyIntent('inquiry', 0);
    }

    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      this.logger.warn('DEEPSEEK_API_KEY is missing. Falling back to local order parser.');
      return this.localParseMessage(message, productContext);
    }

    try {
      const response = await axios.post(
        'https://api.deepseek.com/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: this.buildSystemPrompt(productContext),
            },
            {
              role: 'user',
              content: message,
            },
          ],
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const aiText = response.data?.choices?.[0]?.message?.content;
      const parsed = this.safeParseJson(aiText);

      if (!parsed) {
        this.logger.warn(`AI returned non-JSON: ${aiText}`);
        return this.localParseMessage(message, productContext);
      }

      return this.normalizeAiResult(parsed, message);
    } catch (error) {
      this.logger.error('AI ERROR', error);
      return this.localParseMessage(message, productContext);
    }
  }

  private safeParseJson(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'string') {
      return null;
    }

    let cleaned = value.trim();
    if (!cleaned) {
      return null;
    }

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
      () => {
        const lines = cleaned.split('\n').filter(
          (l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#'),
        );
        return JSON.parse(lines.join('\n'));
      },
    ];

    for (const attempt of attempts) {
      try {
        const result = attempt();
        if (result !== undefined && typeof result === 'object' && !Array.isArray(result)) {
          return result as Record<string, unknown>;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private normalizeAiResult(value: Record<string, unknown>, originalMessage: string): AiOrderIntent {
    const fallback = this.localParseMessage(originalMessage);

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return fallback;
    }

    const intent = VALID_INTENTS.includes(value.intent as any)
      ? (value.intent as AiOrderIntent['intent'])
      : fallback.intent;

    const type = VALID_TYPES.includes(value.type as any)
      ? (value.type as AiOrderIntent['type'])
      : fallback.type;

    const items = Array.isArray(value.items)
      ? value.items
          .map((item: unknown) => {
            if (typeof item !== 'object' || item === null) {
              return null;
            }
            const obj = item as Record<string, unknown>;
            return {
              productName: String(obj.productName ?? obj.product ?? obj.name ?? '').trim(),
              quantity: this.normalizeQuantity(obj.quantity),
              size: this.normalizeSize(obj.size),
              sugar: this.normalizeSugar(obj.sugar),
              extras: Array.isArray(obj.extras)
                ? obj.extras.map((e: unknown) => String(e)).filter(Boolean)
                : typeof obj.extras === 'string' && obj.extras
                  ? [String(obj.extras)]
                  : [],
              notes: typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim() : undefined,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null && item.productName.length > 0)
      : fallback.items;

    const confidence =
      typeof value.confidence === 'number' ? value.confidence : fallback.confidence;

    return this.finalize(intent, type, items, confidence);
  }

  private localParseMessage(message: string, productContext?: Array<{ id: string; name: string; category: string; price: any }>): AiOrderIntent {
    const text = message.toLowerCase();

    const products = productContext?.length
      ? productContext
      : [];

    const matchProduct = (input: string): string | undefined => {
      const cleaned = input.toLowerCase().trim();
      if (!cleaned || !products.length) return undefined;

      const exact = products.find(p => cleaned.includes(p.name.toLowerCase()));
      if (exact) return exact.name;

      for (const p of products) {
        const pName = p.name.toLowerCase();
        if (pName.includes(cleaned) || cleaned.includes(pName)) return p.name;
      }
      return undefined;
    };

    const detectQuantity = (input: string): number => {
      const arabicDigits = input.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
      const numeric = arabicDigits.match(/\b(\d+)\b/);
      if (numeric) return Math.max(1, Number(numeric[1]));
      if (/(اتنين|اثنين|٢)/.test(input)) return 2;
      if (/(تلاتة|ثلاثة|٣)/.test(input)) return 3;
      return 1;
    };

    const detectSize = (input: string): 'S' | 'M' | 'L' => {
      if (/(كبير|large|\bl\b)/i.test(input)) return 'L';
      if (/(صغير|small|\bs\b)/i.test(input)) return 'S';
      return 'M';
    };

    const detectSugar = (input: string): '0' | '50' | '100' => {
      if (/(بدون سكر|من غير سكر|سادة|ساده|no sugar|zero sugar)/i.test(input)) return '0';
      if (/(زيادة سكر|سكر زيادة|extra sugar)/i.test(input)) return '100';
      return '50';
    };

    const extractNotes = (input: string, productName: string): string | undefined => {
      const afterProduct = input.substring(input.indexOf(productName.toLowerCase()) + productName.length);
      const cleaned = afterProduct
        .replace(/\b(\d+|واحد|اتنين|اثنين|تلاتة|ثلاثة)\b/g, '')
        .replace(/(كبير|صغير|large|small)/g, '')
        .replace(/(بدون سكر|من غير سكر|سادة|زيادة سكر|سكر زيادة|no sugar|extra sugar)/g, '')
        .replace(/^[\s,]+/, '')
        .replace(/[\s,]+$/, '')
        .trim();
      return cleaned || undefined;
    };

    const parts = text.split(/\s+(?:و|and|,|\+)\s+/);
    const items: AiOrderIntent['items'] = [];

    for (const part of parts) {
      const productName = matchProduct(part);
      if (productName) {
        items.push({
          productName,
          quantity: detectQuantity(part),
          size: detectSize(part),
          sugar: detectSugar(part),
          extras: [],
          notes: extractNotes(part, productName),
        });
      }
    }

    if (items.length === 0) {
      const productName = matchProduct(text);
      if (productName) {
        items.push({
          productName,
          quantity: detectQuantity(text),
          size: detectSize(text),
          sugar: detectSugar(text),
          extras: [],
          notes: extractNotes(text, productName),
        });
      }
    }

    if (items.length === 0) {
      const isComplaint = /(شكوى|وحش|سيء|مشكلة|complaint|bad)/i.test(text);
      return this.emptyIntent(isComplaint ? 'complaint' : 'inquiry', 0.35);
    }

    return {
      intent: 'create_order',
      type: this.detectOrderType(text),
      items,
      confidence: 0.65,
    };
  }

  private detectOrderType(text: string): AiOrderIntent['type'] {
    if (/(delivery|دليفري|توصيل)/i.test(text)) {
      return 'DELIVERY';
    }
    if (/(takeaway|تيك اواي|تيك أواي|سفري)/i.test(text)) {
      return 'TAKEAWAY';
    }
    return 'DINE_IN';
  }

  private normalizeQuantity(value: unknown): number {
    const quantity = Number(value);
    return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  }

  private normalizeSize(value: unknown): 'S' | 'M' | 'L' {
    return VALID_SIZES.includes(value as any) ? (value as 'S' | 'M' | 'L') : 'M';
  }

  private normalizeSugar(value: unknown): '0' | '50' | '100' {
    return VALID_SUGARS.includes(value as any) ? (value as '0' | '50' | '100') : '50';
  }

  private finalize(
    intent: string,
    type: string,
    items: Array<{
      productName: string;
      quantity: number;
      size: 'S' | 'M' | 'L';
      sugar: '0' | '50' | '100';
      extras: string[];
    }>,
    confidence: number,
  ): AiOrderIntent {
    const safeIntent = VALID_INTENTS.includes(intent as any)
      ? (intent as AiOrderIntent['intent'])
      : 'inquiry';
    const safeType = VALID_TYPES.includes(type as any)
      ? (type as AiOrderIntent['type'])
      : 'DINE_IN';
    const safeItems = Array.isArray(items) ? items : [];
    const safeConfidence = typeof confidence === 'number' ? Math.min(1, Math.max(0, confidence)) : 0;
    const effectiveIntent = safeItems.length > 0 ? 'create_order' : safeIntent;

    return {
      intent: effectiveIntent,
      type: safeType,
      items: safeItems,
      confidence: safeConfidence,
    };
  }

  private emptyIntent(intent: AiOrderIntent['intent'], confidence: number): AiOrderIntent {
    return this.finalize(intent, 'DINE_IN', [], confidence);
  }

  private buildSystemPrompt(
    productContext?: Array<{ id: string; name: string; category: string; price: any }>,
  ): string {
    const basePrompt = [
      'You are an AI Order Assistant inside Sonic Coffee System.',
      'Convert Arabic, Egyptian slang, and English customer messages into structured JSON ONLY.',
      '',
      'Return STRICT JSON in this exact format:',
      '{',
      '  "intent": "create_order | inquiry | complaint",',
      '  "type": "DINE_IN | TAKEAWAY | DELIVERY",',
      '  "items": [',
      '    {',
      '      "productName": "string",',
      '      "quantity": 1,',
      '      "size": "S | M | L",',
      '      "sugar": "0 | 50 | 100",',
      '      "extras": []',
      '    }',
      '  ],',
      '  "confidence": 0.9',
      '}',
      '',
      'Rules:',
      '- Output ONLY JSON.',
      '- No markdown and no explanations.',
      '- Normalize size to S, M, or L. Default to M.',
      '- Normalize sugar to 0, 50, or 100. Default to 50.',
      '- Infer quantity as 1 if missing.',
      '- Never return unknown for valid coffee or drink orders.',
      '- Return inquiry or complaint only when the message is not an order.',
      '- Ensure JSON is valid and complete.',
    ].join('\n');

    if (!productContext?.length) {
      return basePrompt;
    }

    const contextJson = JSON.stringify(productContext, null, 2);
    return [
      'You are an AI Order Assistant inside Sonic Coffee System.',
      '',
      'CRITICAL RULES (Non-Negotiable):',
      '- You MUST ONLY recommend products from the AVAILABLE_PRODUCTS list below.',
      '- You are NOT allowed to invent, hallucinate, guess, or suggest products not in this list.',
      '- If a product is not in the AVAILABLE_PRODUCTS list, it does not exist.',
      '- You must respond ONLY using product names from the list.',
      '- Never output product names not in AVAILABLE_PRODUCTS.',
      '- If a user requests a product not in the list, respond exactly with intent "inquiry" and an empty items array.',
      '',
      'AVAILABLE_PRODUCTS:',
      contextJson,
      '',
      'When suggesting products, verify each one against AVAILABLE_PRODUCTS before recommending.',
      '',
      'Convert Arabic, Egyptian slang, and English customer messages into structured JSON ONLY.',
      '',
      'Return STRICT JSON in this exact format:',
      '{',
      '  "intent": "create_order | inquiry | complaint",',
      '  "type": "DINE_IN | TAKEAWAY | DELIVERY",',
      '  "items": [',
      '    {',
      '      "productName": "string (must be from AVAILABLE_PRODUCTS)",',
      '      "quantity": 1,',
      '      "size": "S | M | L",',
      '      "sugar": "0 | 50 | 100",',
      '      "extras": []',
      '    }',
      '  ],',
      '  "confidence": 0.9',
      '}',
      '',
      'Rules:',
      '- Output ONLY JSON. No markdown and no explanations.',
      '- Normalize size to S, M, or L. Default to M.',
      '- Normalize sugar to 0, 50, or 100. Default to 50.',
      '- Infer quantity as 1 if missing.',
      '- productName MUST exactly match a name from AVAILABLE_PRODUCTS.',
      '- If no valid product matches, return intent "inquiry" with empty items.',
      '- Ensure JSON is valid and complete.',
    ].join('\n');
  }
}




