import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductManagementModule } from '../product-management/product-management.module';
import { MenuImportController } from './menu-import.controller';
import { MenuImportService } from './menu-import.service';
import { PreviewService } from './preview.service';
import { Normalizer } from './normalizer.service';
import { ImportValidator } from './validator.service';
import { ParserFactory } from './parsers/parser-factory.service';
import { ImageParser } from './parsers/image-parser.service';
import { PdfParser } from './parsers/pdf-parser.service';
import { ExcelParser } from './parsers/excel-parser.service';
import { CsvParser } from './parsers/csv-parser.service';

@Module({
  imports: [PrismaModule, ProductManagementModule],
  controllers: [MenuImportController],
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
  ],
  exports: [MenuImportService],
})
export class MenuImportModule {}
