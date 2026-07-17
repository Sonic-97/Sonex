import { Injectable } from '@nestjs/common';
import { ParsedProduct } from './interfaces/menu-import.interface';

@Injectable()
export class Normalizer {
  private arabicDigits: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };

  normalize(products: ParsedProduct[]): ParsedProduct[] {
    return products.map(p => ({
      ...p,
      category: this.normalizeCategory(p.category),
      name: this.normalizeName(p.name),
      description: p.description ? this.normalizeDescription(p.description) : undefined,
      price: this.normalizePrice(p.price),
    }));
  }

  normalizeCategory(category: string): string {
    return this.cleanText(category);
  }

  normalizeName(name: string): string {
    return this.cleanText(name);
  }

  normalizeDescription(description: string): string {
    return this.cleanText(description);
  }

  normalizePrice(price: number): number {
    if (isNaN(price) || price < 0) return 0;
    return Math.round(price * 100) / 100;
  }

  normalizeText(text: string): string {
    return this.cleanText(text);
  }

  normalizeDigit(digit: string): string {
    return this.arabicDigits[digit] || digit;
  }

  private cleanText(text: string): string {
    if (!text) return '';

    let result = text.trim();

    result = result.replace(/[٠-٩]/g, d => this.arabicDigits[d] || d);

    result = result.replace(/[,،٫]/g, '.');

    result = result.replace(/[﷼]/g, '');
    result = result.replace(/\b(SAR|SR|ريال|ر\.س)\b/gi, '');

    result = result.replace(/\s+/g, ' ');

    return result.trim();
  }
}
