import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface ParsedProduct {
  name: string;
  price: number;
  category?: string;
  description?: string;
  emoji?: string;
}

@Injectable()
export class AiMenuParserService {
  private readonly logger = new Logger(AiMenuParserService.name);

  async parseMenuText(text: string): Promise<ParsedProduct[]> {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('No AI API key found, using local fallback parser');
      return this.localParse(text);
    }

    const systemPrompt = `You are a menu extraction AI. Extract ALL menu items from the text.

Return a JSON array of objects, each with:
- name (string, product name)
- price (number, price in EGP — extract the number, default 0 if unknown)
- category (string, optional — e.g. "مشروبات ساخنة", "مشروبات باردة", "حلويات", "مأكولات", "قهوة")
- description (string, optional — brief description if available)
- emoji (string, optional — a single relevant emoji)

Rules:
- Extract EVERY product mentioned
- If price is written as "25 EGP" or "جنيه 25" or "LE25", extract as number 25
- If price range, use the higher value
- If price is unclear, use 0
- Group similar items under same name if they're the same product with different sizes
- Return ONLY valid JSON, no other text`;

    try {
      const response = await axios.post(
        'https://api.deepseek.com/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) return this.localParse(text);

      const parsed = this.safeParseJson(content);
      if (!Array.isArray(parsed)) return this.localParse(text);

      return parsed.map((item: any) => ({
        name: String(item.name || '').trim(),
        price: Math.max(0, Number(item.price) || 0),
        category: item.category ? String(item.category).trim() : undefined,
        description: item.description ? String(item.description).trim() : undefined,
        emoji: item.emoji ? String(item.emoji).trim() : undefined,
      })).filter(item => item.name.length > 0);
    } catch (err) {
      this.logger.error('AI menu parse failed', err);
      return this.localParse(text);
    }
  }

  private localParse(text: string): ParsedProduct[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const results: ParsedProduct[] = [];

    for (const line of lines) {
      const priceMatch = line.match(/(\d+[.,]?\d*)\s*(EGP|LE|جنيه|ج\.م|جم|\.)?$/i);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(',', '.'));
        const name = line.substring(0, priceMatch.index).trim().replace(/[-\s]+$/, '');
        if (name.length > 1) {
          results.push({ name, price: isNaN(price) ? 0 : price });
        }
      } else if (line.length > 2 && !line.match(/^(menu|قائمة|السعر|المنتج|الصنف|المشروب|سعر|مشروب|Product|Price)/i)) {
        results.push({ name: line, price: 0 });
      }
    }

    return results;
  }

  private safeParseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try { return JSON.parse(match[0]); } catch {}
      }
      return null;
    }
  }
}
