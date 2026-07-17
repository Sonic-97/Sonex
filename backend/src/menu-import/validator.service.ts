import { Injectable } from '@nestjs/common';
import { ParsedProduct, ImportWarning, ImportError } from './interfaces/menu-import.interface';

@Injectable()
export class ImportValidator {
  validate(
    products: ParsedProduct[],
  ): { valid: ParsedProduct[]; warnings: ImportWarning[]; errors: ImportError[] } {
    const valid: ParsedProduct[] = [];
    const warnings: ImportWarning[] = [];
    const errors: ImportError[] = [];
    const seenNames = new Set<string>();

    for (const product of products) {
      const rowNum = product.rowNumber;
      let hasError = false;

      if (!product.name || product.name.trim().length === 0) {
        errors.push({ rowNumber: rowNum, field: 'name', message: 'Product name is missing', productName: product.name });
        hasError = true;
      }

      if (!product.price || product.price <= 0 || isNaN(product.price)) {
        errors.push({ rowNumber: rowNum, field: 'price', message: `Invalid price: ${product.price}`, productName: product.name || 'unknown' });
        hasError = true;
      }

      if (!product.category || product.category.trim().length === 0) {
        warnings.push({ rowNumber: rowNum, field: 'category', message: 'Category is empty, using "general"', productName: product.name });
        product.category = 'general';
      }

      if (product.name && seenNames.has(product.name.toLowerCase())) {
        warnings.push({ rowNumber: rowNum, field: 'name', message: `Duplicate product name: "${product.name}"`, productName: product.name });
      }
      if (product.name) {
        seenNames.add(product.name.toLowerCase());
      }

      if (!hasError) {
        valid.push(product);
      }
    }

    return { valid, warnings, errors };
  }
}
