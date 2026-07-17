import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ImportFileType, ParsedProduct, ImportWarning } from '../interfaces/menu-import.interface';
import { ImageParser } from './image-parser.service';
import { PdfParser } from './pdf-parser.service';
import { ExcelParser } from './excel-parser.service';
import { CsvParser } from './csv-parser.service';

@Injectable()
export class ParserFactory {
  private readonly logger = new Logger(ParserFactory.name);

  constructor(
    private readonly imageParser: ImageParser,
    private readonly pdfParser: PdfParser,
    private readonly excelParser: ExcelParser,
    private readonly csvParser: CsvParser,
  ) {}

  detectType(fileName: string, mimeType?: string): ImportFileType {
    const lower = fileName.toLowerCase();
    const ext = lower.split('.').pop() || '';

    if (mimeType) {
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType === 'application/pdf') return 'pdf';
      if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'excel';
      if (mimeType === 'text/csv' || mimeType === 'application/csv') return 'csv';
    }

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['xlsx', 'xls'].includes(ext)) return 'excel';
    if (ext === 'csv') return 'csv';

    throw new BadRequestException(`Unsupported file format: .${ext}`);
  }

  async parse(
    buffer: Buffer,
    fileType: ImportFileType,
    fileName: string,
  ): Promise<{ products: ParsedProduct[]; warnings: ImportWarning[] }> {
    switch (fileType) {
      case 'image': {
        const products = await this.imageParser.parse(buffer, fileName);
        return { products, warnings: [] };
      }
      case 'pdf': {
        const products = await this.pdfParser.parse(buffer, fileName);
        return { products, warnings: [] };
      }
      case 'excel': {
        return this.excelParser.parse(buffer, fileName);
      }
      case 'csv': {
        return this.csvParser.parse(buffer, fileName);
      }
    }
  }
}
