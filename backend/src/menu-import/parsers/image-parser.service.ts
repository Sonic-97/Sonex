import { Injectable, Logger } from '@nestjs/common';
import * as Tesseract from 'tesseract.js';
import { ParsedProduct } from '../interfaces/menu-import.interface';
import { Normalizer } from '../normalizer.service';

@Injectable()
export class ImageParser {
  private readonly logger = new Logger(ImageParser.name);

  constructor(private readonly normalizer: Normalizer) {}

  async parse(buffer: Buffer, fileName: string): Promise<ParsedProduct[]> {
    this.logger.log(`Starting OCR for ${fileName}`);

    let text: string;
    try {
      const result = await Tesseract.recognize(buffer, 'ara+eng', {
        logger: (info) => {
          if (info.status === 'recognizing text') {
            this.logger.debug(`OCR progress: ${Math.round(info.progress * 100)}%`);
          }
        },
      });
      text = result.data.text;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OCR failed';
      this.logger.error(`OCR failed for ${fileName}: ${message}`);
      throw new Error(`OCR failed: ${message}`);
    }

    if (!text || text.trim().length === 0) {
      this.logger.warn(`No text extracted from ${fileName}`);
      return [];
    }

    return this.parseMenuText(text);
  }

  private parseMenuText(text: string): ParsedProduct[] {
    const products: ParsedProduct[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentCategory = 'general';
    let rowNumber = 0;

    for (const line of lines) {
      rowNumber++;

      const cleaned = this.normalizer.normalizeText(line);

      const categoryMatch = cleaned.match(/^[#*]{1,2}\s*(.+)/);
      if (categoryMatch) {
        currentCategory = this.normalizer.normalizeCategory(categoryMatch[1].trim());
        continue;
      }

      const productMatch = this.extractProduct(cleaned, currentCategory, rowNumber);
      if (productMatch) {
        products.push(productMatch);
      }
    }

    return products;
  }

  private extractProduct(line: string, category: string, rowNumber: number): ParsedProduct | null {
    const priceMatch = line.match(/(\d+[\.،]?\d*)\s*(SAR|SR|ريال|ر\.س|﷼)?$/i);
    if (!priceMatch) return null;

    const priceStr = priceMatch[1].replace(',', '.').replace('،', '.');
    const price = parseFloat(priceStr);
    if (isNaN(price)) return null;

    const namePart = line.substring(0, priceMatch.index).trim();
    if (!namePart || namePart.length === 0) return null;

    return {
      category: this.normalizer.normalizeCategory(category),
      name: this.normalizer.normalizeName(namePart.replace(/^[\d.]+[\)\]\}\.\s]*/, '').trim()),
      price: this.normalizer.normalizePrice(price),
      rowNumber,
    };
  }
}
