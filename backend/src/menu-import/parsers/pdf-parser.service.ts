import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { ParsedProduct } from '../interfaces/menu-import.interface';
import { Normalizer } from '../normalizer.service';

@Injectable()
export class PdfParser {
  private readonly logger = new Logger(PdfParser.name);

  constructor(private readonly normalizer: Normalizer) {}

  async parse(buffer: Buffer, fileName: string): Promise<ParsedProduct[]> {
    this.logger.log(`Parsing PDF: ${fileName} (${buffer.length} bytes)`);

    let textResult: import('pdf-parse').TextResult;
    try {
      const doc = new PDFParse({ data: buffer });
      const info = await doc.getInfo();
      this.logger.log(`PDF loaded: ${info.pages.length} page(s)`);

      textResult = await doc.getText();
      await doc.destroy();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF parse failed';
      this.logger.error(`PDF parse failed for ${fileName}: ${message}`);
      throw new Error(`PDF parse failed: ${message}`);
    }

    if (!textResult.text || textResult.text.trim().length === 0) {
      this.logger.warn(`No text extracted from PDF ${fileName}`);
      return [];
    }

    return this.parseMenuText(textResult.text);
  }

  private parseMenuText(text: string): ParsedProduct[] {
    const products: ParsedProduct[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    let currentCategory = 'general';
    let rowNumber = 0;

    for (const line of lines) {
      rowNumber++;

      const cleaned = this.normalizer.normalizeText(line);

      const categoryMatch = cleaned.match(/^[#*\-•—]{1,3}\s*(.+?)$/) ||
                            cleaned.match(/^(.+?)\s*:(\s*)$/);
      if (categoryMatch) {
        const cat = categoryMatch[1] || categoryMatch[0];
        const trimmed = cat.trim();
        if (trimmed.length < 30 && !trimmed.match(/\d+/)) {
          currentCategory = this.normalizer.normalizeCategory(trimmed);
          continue;
        }
      }

      const product = this.extractProduct(cleaned, currentCategory, rowNumber);
      if (product) {
        products.push(product);
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
      name: this.normalizer.normalizeName(namePart),
      price: this.normalizer.normalizePrice(price),
      rowNumber,
    };
  }
}
