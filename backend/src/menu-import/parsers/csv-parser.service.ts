import { Injectable, Logger } from '@nestjs/common';
import { parseString } from '@fast-csv/parse';
import { ParsedProduct, ImportWarning } from '../interfaces/menu-import.interface';
import { Normalizer } from '../normalizer.service';

@Injectable()
export class CsvParser {
  private readonly logger = new Logger(CsvParser.name);

  constructor(private readonly normalizer: Normalizer) {}

  async parse(buffer: Buffer, fileName: string): Promise<{ products: ParsedProduct[]; warnings: ImportWarning[] }> {
    this.logger.log(`Parsing CSV: ${fileName} (${buffer.length} bytes)`);

    return new Promise((resolve, reject) => {
      const products: ParsedProduct[] = [];
      const warnings: ImportWarning[] = [];
      let rowNumber = 0;

      const stream = parseString(buffer.toString('utf-8'), { headers: true, ignoreEmpty: true })
        .on('error', (err) => {
          reject(new Error(`CSV parse failed: ${err.message}`));
        })
        .on('data', (row: any) => {
          rowNumber++;

          const name = this.rowValue(row, 'name');
          const category = this.rowValue(row, 'category') || 'general';
          const priceRaw = this.rowValue(row, 'price');
          const description = this.rowValue(row, 'description');
          const sku = this.rowValue(row, 'sku');
          const imageUrl = this.rowValue(row, 'imageUrl');

          if (!name && !priceRaw) return;

          if (!name) {
            warnings.push({ rowNumber, field: 'name', message: 'Row has no product name' });
            return;
          }

          const price = parseFloat(String(priceRaw || '0').replace(',', '.'));

          if (isNaN(price)) {
            warnings.push({ rowNumber, field: 'price', message: `Invalid price "${priceRaw}" for "${name}"`, productName: name });
            return;
          }

          products.push({
            category: this.normalizer.normalizeCategory(String(category)),
            name: this.normalizer.normalizeName(String(name)),
            price: this.normalizer.normalizePrice(price),
            description: description ? this.normalizer.normalizeDescription(String(description)) : undefined,
            sku: sku ? String(sku) : undefined,
            imageUrl: imageUrl ? String(imageUrl) : undefined,
            rowNumber,
          });
        })
        .on('end', () => {
          this.logger.log(`CSV parsed: ${products.length} products, ${warnings.length} warnings`);
          resolve({ products, warnings });
        });
    });
  }

  private detectHeaders(headers: string[]): (string | null)[] {
    const keywordMap: Record<string, string[]> = {
      name: ['name', 'product', 'item', 'product name', 'item name', 'الاسم', 'اسم المنتج', 'الصنف', 'المنتج'],
      category: ['category', 'section', 'group', 'القسم', 'التصنيف', 'الفئة', 'المجموعة'],
      price: ['price', 'cost', 'unit price', 'السعر', 'التكلفة', 'سعر الوحدة', 'سعر'],
      description: ['description', 'desc', 'details', 'notes', 'الوصف', 'التفاصيل', 'ملاحظات'],
      sku: ['sku', 'code', 'product code', 'رمز', 'كود', 'رمز المنتج'],
      imageUrl: ['image', 'image url', 'photo', 'picture', 'صورة', 'رابط الصورة'],
    };

    return headers.map(h => {
      const lower = h.toLowerCase().trim();
      for (const [field, aliases] of Object.entries(keywordMap)) {
        if (aliases.includes(lower)) return field;
      }
      return null;
    });
  }

  private rowValue(row: any, field: string): string | undefined {
    if (!row || typeof row !== 'object') return undefined;
    const keys = Object.keys(row);
    const matchedKey = keys.find(k => {
      const lower = k.toLowerCase().trim();
      const aliases: Record<string, string[]> = {
        name: ['name', 'product', 'item', 'product name', 'item name', 'الاسم', 'اسم المنتج', 'الصنف', 'المنتج'],
        category: ['category', 'section', 'group', 'القسم', 'التصنيف', 'الفئة', 'المجموعة'],
        price: ['price', 'cost', 'unit price', 'السعر', 'التكلفة', 'سعر الوحدة', 'سعر'],
        description: ['description', 'desc', 'details', 'notes', 'الوصف', 'التفاصيل', 'ملاحظات'],
        sku: ['sku', 'code', 'product code', 'رمز', 'كود', 'رمز المنتج'],
        imageUrl: ['image', 'image url', 'photo', 'picture', 'صورة', 'رابط الصورة'],
      };
      return (aliases[field] || []).includes(lower);
    });
    if (!matchedKey) return undefined;
    const val = row[matchedKey];
    return val === null || val === undefined ? undefined : String(val);
  }
}
