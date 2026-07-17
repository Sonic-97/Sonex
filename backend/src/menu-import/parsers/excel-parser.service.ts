import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ParsedProduct, ImportWarning } from '../interfaces/menu-import.interface';
import { Normalizer } from '../normalizer.service';

@Injectable()
export class ExcelParser {
  private readonly logger = new Logger(ExcelParser.name);

  constructor(private readonly normalizer: Normalizer) {}

  async parse(buffer: Buffer, fileName: string): Promise<{ products: ParsedProduct[]; warnings: ImportWarning[] }> {
    this.logger.log(`Parsing Excel: ${fileName} (${buffer.length} bytes)`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const products: ParsedProduct[] = [];
    const warnings: ImportWarning[] = [];

    for (const worksheet of workbook.worksheets) {
      const result = this.parseWorksheet(worksheet);
      products.push(...result.products);
      warnings.push(...result.warnings);
    }

    return { products, warnings };
  }

  private parseWorksheet(worksheet: ExcelJS.Worksheet): { products: ParsedProduct[]; warnings: ImportWarning[] } {
    const products: ParsedProduct[] = [];
    const warnings: ImportWarning[] = [];

    const rows = worksheet.getRows(1, worksheet.rowCount);
    if (!rows || rows.length === 0) return { products, warnings };

    const { headerMap, headerRowNum } = this.detectHeaders(rows);
    if (!headerMap) {
      warnings.push({ message: `Could not detect columns in sheet "${worksheet.name}", skipping` });
      return { products, warnings };
    }

    const dataStartRow = headerRowNum + 1;

    for (let i = dataStartRow; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;

      const name = String(this.cellValue(row, headerMap.name) || '');
      const category = String(this.cellValue(row, headerMap.category) || 'general');
      const priceRaw = this.cellValue(row, headerMap.price);
      const description = this.cellValue(row, headerMap.description);
      const sku = headerMap.sku !== undefined ? String(this.cellValue(row, headerMap.sku) || '') : undefined;
      const imageUrl = headerMap.imageUrl !== undefined ? String(this.cellValue(row, headerMap.imageUrl) || '') : undefined;

      if (!name && !priceRaw) continue;

      if (!name) {
        warnings.push({ rowNumber, field: 'name', message: 'Row has no product name' });
        continue;
      }

      const price = typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw || '0').replace(',', '.'));

      if (isNaN(price)) {
        warnings.push({ rowNumber, field: 'price', message: `Invalid price "${priceRaw}" for "${name}"`, productName: name });
        continue;
      }

      products.push({
        category: this.normalizer.normalizeCategory(category),
        name: this.normalizer.normalizeName(String(name)),
        price: this.normalizer.normalizePrice(price),
        description: description ? this.normalizer.normalizeDescription(String(description)) : undefined,
        sku: sku ? String(sku) : undefined,
        imageUrl: imageUrl ? String(imageUrl) : undefined,
        rowNumber,
      });
    }

    return { products, warnings };
  }

  private detectHeaders(rows: ExcelJS.Row[]): { headerMap: Record<string, number> | null; headerRowNum: number } {
    const keywords: Record<string, string[]> = {
      name: ['name', 'product', 'item', 'product name', 'item name', 'الاسم', 'اسم المنتج', 'الصنف', 'المنتج'],
      category: ['category', 'section', 'group', 'القسم', 'التصنيف', 'الفئة', 'المجموعة'],
      price: ['price', 'cost', 'unit price', 'السعر', 'التكلفة', 'سعر الوحدة', 'سعر'],
      description: ['description', 'desc', 'details', 'notes', 'الوصف', 'التفاصيل', 'ملاحظات'],
      sku: ['sku', 'code', 'product code', 'رمز', 'كود', 'رمز المنتج'],
      imageUrl: ['image', 'image url', 'photo', 'picture', 'صورة', 'رابط الصورة'],
    };

    for (let rowIdx = 0; rowIdx < Math.min(rows.length, 10); rowIdx++) {
      const row = rows[rowIdx];
      if (!row || !row.values) continue;

      const vals = row.values;
      const cells = Array.isArray(vals) ? vals.slice(1).map((v: unknown) => String(v || '').toLowerCase().trim()) : [];
      const headerMap: Record<string, number> = {};
      let matched = 0;

      for (const [field, aliases] of Object.entries(keywords)) {
        const colIdx = cells.findIndex(c => aliases.includes(c));
        if (colIdx >= 0) {
          headerMap[field] = colIdx;
          matched++;
        }
      }

      if (matched >= 2) {
        return { headerMap, headerRowNum: rowIdx };
      }
    }

    return { headerMap: null, headerRowNum: 0 };
  }

  private cellValue(row: ExcelJS.Row, colIndex: number): string | number | undefined {
    const values = row.values as ExcelJS.CellValue[];
    const val = values[colIndex + 1];
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'object' && !Array.isArray(val) && 'text' in (val as any)) return (val as any).text as string;
    if (typeof val === 'object' && !Array.isArray(val) && 'result' in (val as any)) return (val as any).result as string;
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'number' || typeof val === 'string') return val;
    return String(val);
  }
}
