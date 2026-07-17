import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductManagementService } from '../product-management/product-management.service';
import {
  ImportFileType,
  ImportPreview,
  ParsedProduct,
  ImportWarning,
  ImportError,
  ImportResult,
} from './interfaces/menu-import.interface';
import { ParserFactory } from './parsers/parser-factory.service';
import { Normalizer } from './normalizer.service';
import { ImportValidator } from './validator.service';
import { PreviewService } from './preview.service';
import { CreateProductDto, CreateCategoryDto } from '../product-management/dto/product.dto';

@Injectable()
export class MenuImportService {
  private readonly logger = new Logger(MenuImportService.name);

  constructor(
    private readonly parserFactory: ParserFactory,
    private readonly normalizer: Normalizer,
    private readonly validator: ImportValidator,
    private readonly previewService: PreviewService,
    private readonly productManagement: ProductManagementService,
    private readonly prisma: PrismaService,
  ) {}

  async uploadAndPreview(
    buffer: Buffer,
    fileName: string,
    mimeType?: string,
    cafeId?: string,
    branchId?: string,
  ): Promise<ImportPreview> {
    this.logger.log(`Processing upload: ${fileName} (${buffer.length} bytes)`);

    const fileType = this.parserFactory.detectType(fileName, mimeType);

    const { products: rawProducts, warnings: parserWarnings } = await this.parserFactory.parse(
      buffer,
      fileType,
      fileName,
    );

    const normalized = this.normalizer.normalize(rawProducts);

    const { valid, warnings: validationWarnings, errors } = this.validator.validate(normalized);

    const allWarnings = [...parserWarnings, ...validationWarnings];

    const preview = this.previewService.createPreview(
      normalized,
      allWarnings,
      errors,
      valid,
      fileName,
      fileType,
      cafeId,
      branchId,
    );

    this.previewService.storeSession(preview, cafeId, branchId);

    return preview;
  }

  async confirmImport(sessionId: string, cafeId?: string, branchId?: string): Promise<ImportResult> {
    return this.previewService.confirmSession(sessionId, async (products, cId, bId) => {
      return this.executeImport(products, cId, bId);
    });
  }

  private async executeImport(
    products: ParsedProduct[],
    cafeId?: string,
    branchId?: string,
  ): Promise<{
    importedCount: number;
    failedCount: number;
    errors: ImportError[];
    categoriesCreated: string[];
    productsCreated: string[];
  }> {
    let importedCount = 0;
    let failedCount = 0;
    const errors: ImportError[] = [];
    const categoriesCreated: string[] = [];
    const productsCreated: string[] = [];
    const categoryCache = new Map<string, string>();

    const existingCategories = await this.productManagement.findAllCategories(false, cafeId);
    for (const cat of existingCategories) {
      categoryCache.set(cat.name.toLowerCase(), cat.id);
    }

    for (const product of products) {
      try {
        let categoryId = categoryCache.get(product.category.toLowerCase());

        if (!categoryId) {
          const catDto = new CreateCategoryDto();
          catDto.name = product.category;
          const category = await this.productManagement.createCategory(catDto, cafeId, branchId);
          categoryId = category.id;
          categoryCache.set(product.category.toLowerCase(), categoryId);
          categoriesCreated.push(product.category);
        }

        const dto = new CreateProductDto();
        dto.name = product.name;
        dto.price = product.price;
        dto.category = product.category;
        dto.categoryId = categoryId;
        dto.description = product.description;
        dto.active = true;

        await this.productManagement.createProduct(dto, cafeId, branchId);
        importedCount++;
        productsCreated.push(product.name);
      } catch (err) {
        failedCount++;
        const message = err instanceof Error ? err.message : 'Import failed';
        errors.push({ productName: product.name, message, rowNumber: product.rowNumber });
        this.logger.error(`Failed to import product "${product.name}": ${message}`);
      }
    }

    this.logger.log(`Import completed: ${importedCount} imported, ${failedCount} failed`);

    return { importedCount, failedCount, errors, categoriesCreated, productsCreated };
  }
}
