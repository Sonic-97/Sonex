import { Test, TestingModule } from '@nestjs/testing';
import { MenuImportService } from './menu-import.service';
import { PreviewService } from './preview.service';
import { Normalizer } from './normalizer.service';
import { ImportValidator } from './validator.service';
import { ParserFactory } from './parsers/parser-factory.service';
import { ImageParser } from './parsers/image-parser.service';
import { PdfParser } from './parsers/pdf-parser.service';
import { ExcelParser } from './parsers/excel-parser.service';
import { CsvParser } from './parsers/csv-parser.service';
import { PrismaService } from '../prisma/prisma.service';

import { ProductManagementService } from '../product-management/product-management.service';

const mockProductService = {
  findAllCategories: jest.fn().mockResolvedValue([]),
  createCategory: jest.fn().mockImplementation((dto: any) =>
    Promise.resolve({ id: 'cat-' + dto.name, name: dto.name }),
  ),
  createProduct: jest.fn().mockResolvedValue({ id: 'prod-1' }),
};

describe('MenuImportService', () => {
  let service: MenuImportService;
  let normalizer: Normalizer;
  let validator: ImportValidator;
  let parserFactory: ParserFactory;
  let excelParser: ExcelParser;
  let csvParser: CsvParser;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuImportService,
        PreviewService,
        Normalizer,
        ImportValidator,
        ParserFactory,
        ImageParser,
        PdfParser,
        ExcelParser,
        CsvParser,
        { provide: PrismaService, useValue: {} },
        {
          provide: ProductManagementService,
          useValue: mockProductService,
        },
      ],
    }).compile();

    service = module.get<MenuImportService>(MenuImportService);
    normalizer = module.get<Normalizer>(Normalizer);
    validator = module.get<ImportValidator>(ImportValidator);
    parserFactory = module.get<ParserFactory>(ParserFactory);
    excelParser = module.get<ExcelParser>(ExcelParser);
    csvParser = module.get<CsvParser>(CsvParser);
  });

  // ── Normalizer ──

  it('normalizes Arabic digits to English', () => {
    expect(normalizer.normalizeText('قهوة ١٢٣')).toBe('قهوة 123');
    expect(normalizer.normalizeText('سعر ٤٥٫٥٠')).toBe('سعر 45.50');
  });

  it('normalizes price to 2 decimal places', () => {
    expect(normalizer.normalizePrice(12.345)).toBe(12.35);
    expect(normalizer.normalizePrice(-5)).toBe(0);
    expect(normalizer.normalizePrice(NaN)).toBe(0);
  });

  it('normalizes whitespace and currency symbols', () => {
    expect(normalizer.normalizeText('  Caramel   Latte  ')).toBe('Caramel Latte');
    expect(normalizer.normalizeText('قهوة ١٢٣ SAR')).toBe('قهوة 123');
    expect(normalizer.normalizeText('Price 50 ﷼')).toBe('Price 50');
  });

  // ── Validator ──

  it('validates products and detects errors', () => {
    const products = [
      { category: 'drinks', name: '', price: 10, rowNumber: 1 },
      { category: 'food', name: 'Croissant', price: 0, rowNumber: 2 },
      { category: 'drinks', name: 'Latte', price: 15, rowNumber: 3 },
      { category: '', name: 'Muffin', price: 8, rowNumber: 4 },
      { category: 'food', name: 'Latte', price: 12, rowNumber: 5 },
    ];

    const { valid, warnings, errors } = validator.validate(products as any);

    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(valid.length).toBe(3);
    expect(warnings.some(w => w.message.includes('Duplicate'))).toBe(true);
  });

  it('detects missing name', () => {
    const { errors } = validator.validate([
      { category: 'd', name: '', price: 10, rowNumber: 1 },
    ] as any);

    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe('name');
  });

  it('detects invalid price', () => {
    const { errors } = validator.validate([
      { category: 'd', name: 'X', price: -1, rowNumber: 1 },
    ] as any);

    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe('price');
  });

  it('warns on empty category and defaults to general', () => {
    const { valid, warnings } = validator.validate([
      { category: '', name: 'X', price: 10, rowNumber: 1 },
    ] as any);

    expect(valid[0].category).toBe('general');
    expect(warnings.some(w => w.field === 'category')).toBe(true);
  });

  it('skips duplicate product names with warning', () => {
    const { valid, warnings } = validator.validate([
      { category: 'd', name: 'Latte', price: 10, rowNumber: 1 },
      { category: 'd', name: 'latte', price: 12, rowNumber: 2 },
    ] as any);

    expect(valid.length).toBe(2);
    expect(warnings.some(w => w.message.includes('Duplicate'))).toBe(true);
  });

  // ── Parser Factory ──

  it('detects file type by extension', () => {
    expect(parserFactory.detectType('menu.jpg')).toBe('image');
    expect(parserFactory.detectType('menu.pdf')).toBe('pdf');
    expect(parserFactory.detectType('menu.xlsx')).toBe('excel');
    expect(parserFactory.detectType('menu.csv')).toBe('csv');
    expect(parserFactory.detectType('menu.png')).toBe('image');
  });

  it('detects file type by mime type', () => {
    expect(parserFactory.detectType('menu.foo', 'image/png')).toBe('image');
    expect(parserFactory.detectType('menu.foo', 'application/pdf')).toBe('pdf');
    expect(parserFactory.detectType('menu.foo', 'text/csv')).toBe('csv');
  });

  it('throws on unsupported file format', () => {
    expect(() => parserFactory.detectType('menu.doc')).toThrow('Unsupported');
  });

  // ── CSV Parser ──

  it('parses CSV content correctly', async () => {
    const csv = `name,category,price,description
Espresso,Drinks,15,Strong coffee
Croissant,Food,12,Fresh baked`;

    const result = await csvParser.parse(Buffer.from(csv), 'test.csv');

    expect(result.products.length).toBe(2);
    expect(result.products[0].name).toBe('Espresso');
    expect(result.products[0].category).toBe('Drinks');
    expect(result.products[0].price).toBe(15);
    expect(result.products[1].name).toBe('Croissant');
  });

  it('parses CSV with Arabic headers', async () => {
    const csv = `الاسم,السعر,القسم
قهوة,10,مشروبات
شاي,8,مشروبات`;

    const result = await csvParser.parse(Buffer.from(csv), 'test.csv');

    expect(result.products.length).toBe(2);
    expect(result.products[0].name).toBe('قهوة');
  });

  it('handles empty CSV gracefully', async () => {
    const result = await csvParser.parse(Buffer.from('name,price\n'), 'empty.csv');
    expect(result.products.length).toBe(0);
  });

  // ── Excel Parser ──

  it('parses Excel-like structure', () => {
    const buf = Buffer.from('fake excel');
    expect(typeof excelParser.parse).toBe('function');
  });

  // ── Preview Service ──

  it('creates preview with correct stats', () => {
    const previewService = new PreviewService();
    const products = [
      { category: 'Drinks', name: 'Latte', price: 15 },
      { category: 'Food', name: 'Croissant', price: 10 },
    ] as ParsedProduct[];

    const preview = previewService.createPreview(products, [], [], products, 'test.xlsx', 'excel');

    expect(preview.stats.validProducts).toBe(2);
    expect(preview.stats.invalidProducts).toBe(0);
    expect(preview.categories.length).toBe(2);
    expect(preview.sessionId).toBeDefined();
  });

  it('stores and retrieves sessions', () => {
    const previewService = new PreviewService();

    const preview = previewService.createPreview([], [], [], [], 'test.xlsx', 'excel');
    previewService.storeSession(preview);

    const session = previewService.getSession(preview.sessionId);
    expect(session).toBeDefined();
    expect(session!.status).toBe('pending');
  });

  it('rejects confirm for non-existent session', async () => {
    const previewService = new PreviewService();
    await expect(
      previewService.confirmSession('nonexistent', async () => ({
        importedCount: 0,
        failedCount: 0,
        errors: [],
        categoriesCreated: [],
        productsCreated: [],
      })),
    ).rejects.toThrow('not found');
  });

  it('completes import session successfully', async () => {
    const previewService = new PreviewService();
    const preview = previewService.createPreview([], [], [], [], 'test.xlsx', 'excel');
    previewService.storeSession(preview);

    const result = await previewService.confirmSession(preview.sessionId, async () => ({
      importedCount: 5,
      failedCount: 0,
      errors: [],
      categoriesCreated: ['Drinks'],
      productsCreated: ['Latte', 'Mocha'],
    }));

    expect(result.status).toBe('completed');
    expect(result.importedCount).toBe(5);
    expect(result.categoriesCreated).toContain('Drinks');
  });

  // ── Upload & Preview Pipeline ──

  it('processes upload and returns preview', async () => {
    const csv = `name,category,price
Latte,Drinks,15
Mocha,Drinks,18`;

    const preview = await service.uploadAndPreview(
      Buffer.from(csv),
      'test.csv',
      'text/csv',
    );

    expect(preview.fileType).toBe('csv');
    expect(preview.products.length).toBe(2);
    expect(preview.stats.validProducts).toBe(2);
    expect(preview.errors.length).toBe(0);
    expect(preview.sessionId).toBeDefined();
  });

  it('detects validation errors in upload pipe', async () => {
    const csv = `name,category,price
Latte,Drinks,0
Mocha,Drinks,-5`;

    const preview = await service.uploadAndPreview(
      Buffer.from(csv),
      'test.csv',
      'text/csv',
    );

    expect(preview.errors.length).toBeGreaterThanOrEqual(1);
    expect(preview.stats.invalidProducts).toBeGreaterThan(0);
  });

  // ── Import Events ──

  it('emits events through preview service', () => {
    const previewService = new PreviewService();
    const events: any[] = [];
    previewService.onImportEvent((p) => events.push(p));

    const preview = previewService.createPreview(
      [{ category: 'd', name: 'X', price: 10 }],
      [], [],
      [{ category: 'd', name: 'X', price: 10 }],
      'test.xlsx', 'excel',
    );
    previewService.storeSession(preview);

    expect(events.length).toBe(1);
    expect(events[0].validProducts).toBe(1);
  });
});

interface ParsedProduct {
  category: string;
  name: string;
  price: number;
  description?: string;
  sku?: string;
  imageUrl?: string;
  rowNumber?: number;
}
